#!/usr/bin/env python3
"""
minimap2_to_kreport.py

Convert minimap2 alignments (a sorted BAM, or a PAF) into a Kraken2-style report
so minimap2 can act as a drop-in classifier inside Mytax2 (the sunburst / Sankey
/ heatmap views and combine_kreports.py all consume the Kraken2 report format).

Pipeline
--------
1. Count reads per reference sequence, keeping one alignment per read:
   * BAM  -> `samtools view -F 0x904` (primary, mapped, non-supplementary).
   * PAF  -> best alignment per read (max matching bases, then mapq).
2. Translate each reference id -> NCBI taxid via a `seqid2taxid.map`
   (two whitespace columns: seqid  taxid). Candidate locations are derived from
   the reference path; pass one explicitly with --map.
3. If an NCBI taxdump (nodes.dmp + names.dmp) is available, build the FULL
   lineage for every taxid so the report is a proper nested tree (root -> domain
   -> ... -> species) and the taxonomy/hierarchy views work. The per-reference
   lineages are cached next to the reference (`<ref>.lineage.json`) so only the
   first FASTQ pays the (one-time) cost of parsing the dmp files.
   If no taxdump is found, fall back to a flat per-reference report (each
   reference as a species-level child of root), with synthetic ids when a taxid
   map is also missing.

taxdump discovery order: --nodes/--names, then --taxdump <dir>, then next to the
reference, a `taxonomy/` subdir, and ~/.config/mytax2/databases/taxdump/.
"""

import argparse
import json
import os
import subprocess
import sys
import zlib
from collections import Counter, defaultdict


def parse_args():
    p = argparse.ArgumentParser(description="Convert minimap2 BAM/PAF to a Kraken2-style report")
    p.add_argument("--bam", default=None, help="Input sorted BAM (preferred)")
    p.add_argument("--paf", default=None, help="Input minimap2 PAF (alternative to --bam)")
    p.add_argument("--report", required=True, help="Output Kraken2-style report path")
    p.add_argument("--ref", default=None, help="Reference FASTA/MMI path (used to locate the map + taxdump + cache)")
    p.add_argument("--map", default=None, help="Explicit seqid2taxid.map path (seqid<TAB>taxid)")
    p.add_argument("--nodes", default=None, help="Explicit nodes.dmp path")
    p.add_argument("--names", default=None, help="Explicit names.dmp path")
    p.add_argument("--taxdump", default=None, help="Directory containing nodes.dmp + names.dmp")
    p.add_argument("--total", type=int, default=None,
                   help="Total input read count (to report unclassified reads); optional")
    return p.parse_args()


# --- reference id -> taxid map ------------------------------------------------
def candidate_map_paths(ref, explicit):
    cands = []
    if explicit:
        cands.append(explicit)
    if ref:
        d = os.path.dirname(ref)
        stem = strip_ref_ext(ref)
        cands += [stem + ".seqid2taxid.map", ref + ".seqid2taxid.map"]
        if d:
            cands.append(os.path.join(d, "seqid2taxid.map"))
    return dedupe(cands)


def strip_ref_ext(ref):
    stem = ref
    for ext in (".fasta.gz", ".fa.gz", ".fna.gz", ".gz", ".fasta", ".fa", ".fna", ".mmi"):
        if stem.lower().endswith(ext):
            return stem[: -len(ext)]
    return stem


def dedupe(seq):
    seen, out = set(), []
    for c in seq:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def load_seqid2taxid(ref, explicit):
    for path in candidate_map_paths(ref, explicit):
        if os.path.isfile(path):
            mapping = {}
            try:
                with open(path) as fh:
                    for line in fh:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split()
                        if len(parts) >= 2:
                            mapping[parts[0]] = parts[1]
                sys.stderr.write(f"[mytax] minimap2: using taxid map {path} ({len(mapping)} entries)\n")
                return mapping
            except OSError as e:
                sys.stderr.write(f"[mytax] minimap2: could not read {path}: {e}\n")
    return {}


def synthetic_taxid(seqid):
    # Deterministic and stable across runs/files, offset high to avoid clashing
    # with real low NCBI taxids.
    return 90000000 + (zlib.crc32(seqid.encode("utf-8")) % 9000000)


# --- alignment counting -------------------------------------------------------
def bam_ref_counts(bam):
    """Count primary, mapped, non-supplementary alignments per reference."""
    counts = Counter()
    try:
        proc = subprocess.Popen(
            ["samtools", "view", "-F", "0x904", bam],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
    except FileNotFoundError:
        sys.stderr.write("[mytax] minimap2: samtools not found on PATH\n")
        return counts
    for line in proc.stdout:
        # RNAME is column 3 (0-based index 2)
        parts = line.split("\t", 3)
        if len(parts) < 3:
            continue
        rname = parts[2]
        if rname and rname != "*":
            counts[rname] += 1
    proc.wait()
    if proc.returncode not in (0, None):
        err = proc.stderr.read() if proc.stderr else ""
        sys.stderr.write(f"[mytax] minimap2: samtools view exited {proc.returncode}: {err}\n")
    return counts


def paf_ref_counts(paf):
    """Best alignment per read (max matching bases, then mapq), tallied per target."""
    best = {}
    try:
        with open(paf) as fh:
            for line in fh:
                if not line.strip():
                    continue
                f = line.rstrip("\n").split("\t")
                if len(f) < 12:
                    continue
                q, tgt = f[0], f[5]
                try:
                    nmatch, mapq = int(f[9]), int(f[11])
                except ValueError:
                    continue
                prev = best.get(q)
                if prev is None or (nmatch, mapq) > (prev[0], prev[1]):
                    best[q] = (nmatch, mapq, tgt)
    except OSError as e:
        sys.stderr.write(f"[mytax] minimap2: cannot read PAF {paf}: {e}\n")
        return Counter()
    counts = Counter()
    for _q, (_n, _mq, tgt) in best.items():
        counts[tgt] += 1
    return counts


# --- taxdump / lineage --------------------------------------------------------
RANK_CODE = {
    "superkingdom": "D", "domain": "D", "kingdom": "K", "phylum": "P",
    "class": "C", "order": "O", "family": "F", "genus": "G", "species": "S",
}


def find_taxdump(ref, nodes_arg, names_arg, taxdump_arg):
    if nodes_arg and names_arg and os.path.isfile(nodes_arg) and os.path.isfile(names_arg):
        return nodes_arg, names_arg
    dirs = []
    if taxdump_arg:
        dirs.append(taxdump_arg)
    if ref:
        d = os.path.dirname(ref) or "."
        dirs += [d, os.path.join(d, "taxonomy"), os.path.join(d, "taxdump")]
        dirs.append(strip_ref_ext(ref) + ".taxdump")
    dirs.append(os.path.expanduser("~/.config/mytax2/databases/taxdump"))
    for d in dedupe(dirs):
        n, m = os.path.join(d, "nodes.dmp"), os.path.join(d, "names.dmp")
        if os.path.isfile(n) and os.path.isfile(m):
            return n, m
    return None, None


def build_lineage_cache(taxids, nodes_path, names_path):
    """Return {taxid(str): [[taxid,rankcode,name], ... root->leaf]} for the given
    taxids by walking parents in nodes.dmp. Parses the (large) dmp files once."""
    sys.stderr.write(f"[mytax] minimap2: building lineage cache from {nodes_path} (one-time)…\n")
    parent, rank = {}, {}
    with open(nodes_path) as fh:
        for line in fh:
            f = [c.strip() for c in line.split("|")]
            if len(f) >= 3:
                parent[f[0]] = f[1]
                rank[f[0]] = f[2]
    # names: only keep taxids we can reach (scientific name). We don't know the
    # ancestor set yet, so collect all scientific names (memory heavy but one-time).
    name = {}
    with open(names_path) as fh:
        for line in fh:
            f = [c.strip() for c in line.split("|")]
            if len(f) >= 4 and f[3] == "scientific name":
                name[f[0]] = f[1]

    def lineage_of(tid):
        chain = []
        seen = set()
        cur = str(tid)
        while cur and cur not in seen:
            seen.add(cur)
            rk = rank.get(cur, "no rank")
            nm = name.get(cur, cur)
            if cur == "1":
                chain.append([cur, "R", "root"])
                break
            code = RANK_CODE.get(rk, "-")
            chain.append([cur, code, nm])
            nxt = parent.get(cur)
            if not nxt or nxt == cur:
                break
            cur = nxt
        chain.reverse()  # root -> leaf
        if not chain or chain[0][0] != "1":
            chain.insert(0, ["1", "R", "root"])
        return chain

    cache = {}
    for tid in taxids:
        cache[str(tid)] = lineage_of(tid)
    return cache


def load_or_build_lineage(ref, taxids, nodes_path, names_path):
    cache_path = (strip_ref_ext(ref) + ".lineage.json") if ref else None
    # Try cache first (must cover all needed taxids).
    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path) as fh:
                cache = json.load(fh)
            if all(str(t) in cache for t in taxids):
                sys.stderr.write(f"[mytax] minimap2: using cached lineages {cache_path}\n")
                return cache
        except (OSError, ValueError):
            pass
    cache = build_lineage_cache(taxids, nodes_path, names_path)
    if cache_path:
        try:
            tmp = f"{cache_path}.tmp.{os.getpid()}"
            with open(tmp, "w") as fh:
                json.dump(cache, fh)
            os.replace(tmp, cache_path)
        except OSError as e:
            sys.stderr.write(f"[mytax] minimap2: could not write lineage cache {cache_path}: {e}\n")
    return cache


# --- report writers -----------------------------------------------------------
def write_flat_report(report, counts, taxmap, total):
    """No taxdump: each reference (or its taxid) is a species-level child of root."""
    tally = defaultdict(int)
    names = {}
    for ref_id, cnt in counts.items():
        if ref_id in taxmap:
            tid = str(taxmap[ref_id])
        else:
            tid = str(synthetic_taxid(ref_id))
        tally[tid] += cnt
        names.setdefault(tid, ref_id)
    classified = sum(tally.values())
    total = total if (total is not None and total >= classified) else classified
    unclassified = max(total - classified, 0)
    denom = total or 1
    lines = []
    if unclassified:
        lines.append(f"{100.0*unclassified/denom:6.2f}\t{unclassified}\t{unclassified}\tU\t0\tunclassified")
    lines.append(f"{100.0*classified/denom:6.2f}\t{classified}\t0\tR\t1\troot")
    for tid, cnt in sorted(tally.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"{100.0*cnt/denom:6.2f}\t{cnt}\t{cnt}\tS\t{tid}\t  {names.get(tid, tid)}")
    write_lines(report, lines)
    return classified, unclassified, len(tally)


def write_tree_report(report, counts, taxmap, lineage, total):
    """With taxdump: emit a nested tree with clade/taxon counts per lineage node."""
    clade = defaultdict(int)
    taxon = defaultdict(int)
    info = {}                       # taxid -> (rankcode, name)
    children = defaultdict(set)
    unknown = 0
    for ref_id, cnt in counts.items():
        tid = str(taxmap.get(ref_id, "")) if taxmap else ""
        chain = lineage.get(tid) if tid else None
        if not chain:
            unknown += cnt
            continue
        for i, (t, rc, nm) in enumerate(chain):
            clade[t] += cnt
            info[t] = (rc, nm)
            if i > 0:
                children[chain[i - 1][0]].add(t)
        taxon[chain[-1][0]] += cnt
    classified = clade.get("1", 0)
    total = total if (total is not None and total >= (classified + unknown)) else (classified + unknown)
    unclassified = max(total - classified - unknown, 0)
    denom = total or 1
    info.setdefault("1", ("R", "root"))

    lines = []
    if unclassified or unknown:
        u = unclassified + unknown
        lines.append(f"{100.0*u/denom:6.2f}\t{u}\t{u}\tU\t0\tunclassified")

    def emit(tid, depth):
        rc, nm = info.get(tid, ("-", tid))
        indent = "  " * depth
        lines.append(f"{100.0*clade[tid]/denom:6.2f}\t{clade[tid]}\t{taxon.get(tid,0)}\t{rc}\t{tid}\t{indent}{nm}")
        for ch in sorted(children.get(tid, ()), key=lambda c: (-clade[c], c)):
            emit(ch, depth + 1)

    if "1" in clade:
        emit("1", 0)
    write_lines(report, lines)
    return classified, unclassified + unknown, len([t for t in taxon if taxon[t] > 0])


def write_lines(report, lines):
    os.makedirs(os.path.dirname(os.path.abspath(report)), exist_ok=True)
    with open(report, "w") as out:
        out.write("\n".join(lines) + "\n")


def main():
    args = parse_args()
    if not args.bam and not args.paf:
        sys.stderr.write("[mytax] minimap2: need --bam or --paf\n")
        sys.exit(2)

    counts = bam_ref_counts(args.bam) if args.bam else paf_ref_counts(args.paf)
    taxmap = load_seqid2taxid(args.ref, args.map)

    # Only attempt full lineage when we can turn references into real taxids.
    lineage = None
    if taxmap:
        needed = {str(taxmap[r]) for r in counts if r in taxmap}
        if needed:
            nodes_path, names_path = find_taxdump(args.ref, args.nodes, args.names, args.taxdump)
            if nodes_path and names_path:
                try:
                    lineage = load_or_build_lineage(args.ref, needed, nodes_path, names_path)
                except Exception as e:  # noqa: BLE001 - never let taxonomy break a run
                    sys.stderr.write(f"[mytax] minimap2: lineage build failed ({e}); using flat report\n")
                    lineage = None

    if lineage:
        classified, unclassified, ntax = write_tree_report(args.report, counts, taxmap, lineage, args.total)
        mode = "taxdump lineage"
    else:
        classified, unclassified, ntax = write_flat_report(args.report, counts, taxmap, args.total)
        mode = "flat per-reference"

    sys.stderr.write(
        f"[mytax] minimap2: {classified} classified, {unclassified} unclassified, "
        f"{ntax} taxa ({mode}) -> {args.report}\n"
    )


if __name__ == "__main__":
    main()
