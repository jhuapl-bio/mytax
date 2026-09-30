#!/usr/bin/env python3
"""
accession_taxid.py -- link reference sequence ids (accessions) to NCBI taxids.

Used two ways:

1. Library (imported by minimap2_to_kreport.py): after alignment, only the
   reference ids that actually received hits and are missing from the
   seqid2taxid map are resolved, then APPENDED to the map so each accession is
   looked up once per reference, ever.

2. CLI: pre-build a complete map for a reference FASTA up front:

     python3 accession_taxid.py --ref viral.1.1.genomic.fna.gz
     python3 accession_taxid.py --ref ref.fa --accession2taxid nucl_gb.accession2taxid.gz   # offline

Resolution order for each seqid:
  a. taxid embedded in the id itself (Kraken2 style `kraken:taxid|9606|NC_...`,
     or `taxid=NNN` / `tax_id=NNN` / `taxid:NNN`)
  b. an NCBI accession2taxid file, if given (--accession2taxid or
     $MYTAX_ACCESSION2TAXID) -- streamed and filtered, works fully offline
  c. NCBI E-utilities esummary (db=nuccore), batched. Set $NCBI_API_KEY for a
     higher rate limit; set $MYTAX_OFFLINE=1 to disable network lookups.

Map format: `seqid<TAB>taxid` per line (the same file the converter reads).
"""

import argparse
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
BATCH = 200

_EMBEDDED = [
    re.compile(r"kraken:taxid\|(\d+)"),
    re.compile(r"(?:^|[|;\s,])tax_?id[=:|](\d+)", re.I),
]
# GenBank/RefSeq/ENA/DDBJ style accession(.version)
_ACC = re.compile(r"^([A-Z]{1,6}_?[A-Z]{0,6}\d{5,12}(?:\.\d+)?)$")


def log(msg):
    sys.stderr.write(f"[mytax] taxid-link: {msg}\n")
    sys.stderr.flush()


def embedded_taxid(seqid):
    for rx in _EMBEDDED:
        m = rx.search(seqid)
        if m:
            return m.group(1)
    return None


def accession_of(seqid):
    """Pull a plain accession(.version) out of a reference id.
    Handles `NC_001802.1`, `gi|123|ref|NC_001802.1|`, `ref|NC_001802.1|`,
    `kraken:taxid|11676|NC_001802.1`, `NC_001802.1_extra`."""
    s = seqid.strip()
    if "|" in s:
        parts = [p for p in s.split("|") if p]
        for p in reversed(parts):
            if _ACC.match(p):
                return p
    if _ACC.match(s):
        return s
    m = re.match(r"^([A-Z]{1,6}_?[A-Z]{0,6}\d{5,12}\.\d+)", s)
    return m.group(1) if m else None


def _strip_version(acc):
    return acc.split(".", 1)[0]


# --- E-utilities ------------------------------------------------------------
def resolve_eutils(accessions, timeout=20):
    """{accession(.version) -> taxid} via esummary. Stops on network failure
    (returns what it has) so an offline machine doesn't stall every file."""
    out = {}
    accs = sorted(set(accessions))
    if not accs:
        return out
    if os.environ.get("MYTAX_OFFLINE") == "1":
        log("MYTAX_OFFLINE=1 -> skipping NCBI lookup")
        return out
    key = os.environ.get("NCBI_API_KEY")
    delay = 0.11 if key else 0.35  # stay under 10/s (key) or 3/s (no key)
    nb = (len(accs) + BATCH - 1) // BATCH
    log(f"querying NCBI E-utilities for {len(accs)} accession(s) in {nb} batch(es)"
        f"{'' if key else ' (set NCBI_API_KEY for faster lookups)'}")
    for i in range(0, len(accs), BATCH):
        chunk = accs[i:i + BATCH]
        params = {"db": "nuccore", "id": ",".join(chunk), "retmode": "json",
                  "tool": "mytax2", "email": os.environ.get("NCBI_EMAIL", "")}
        if key:
            params["api_key"] = key
        data = urllib.parse.urlencode(params).encode()
        res = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(EUTILS, data=data), timeout=timeout) as r:
                    res = json.load(r).get("result", {})
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503) and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                log(f"NCBI HTTP {e.code} on batch {i // BATCH + 1}/{nb}; stopping lookups")
                return out
            except (urllib.error.URLError, OSError, ValueError) as e:
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                log(f"NCBI unreachable ({e}); unresolved ids keep synthetic taxids this run")
                return out
        if res is None:
            return out
        # result keys are GI uids; each record carries accessionversion + taxid
        by_base = {_strip_version(a): a for a in chunk}
        for uid in res.get("uids", []):
            rec = res.get(uid) or {}
            tid = rec.get("taxid")
            av = rec.get("accessionversion") or rec.get("caption")
            if not tid or not av:
                continue
            if av in chunk:
                out[av] = str(tid)
            elif _strip_version(av) in by_base:
                out[by_base[_strip_version(av)]] = str(tid)
        if nb > 1:
            log(f"batch {i // BATCH + 1}/{nb}: {len(out)} resolved so far")
        time.sleep(delay)
    return out


# --- accession2taxid file (offline) ------------------------------------------
def resolve_a2t(accessions, a2t_path):
    """Stream an NCBI *.accession2taxid(.gz) file (accession, accession.version,
    taxid, gi) keeping only the rows we need."""
    want = set(accessions)
    want_base = {_strip_version(a): a for a in want}
    out = {}
    if not a2t_path or not os.path.isfile(a2t_path):
        return out
    log(f"scanning {a2t_path} for {len(want)} accession(s)…")
    op = gzip.open if a2t_path.endswith(".gz") else open
    t0 = time.time()
    with op(a2t_path, "rt") as fh:
        for n, line in enumerate(fh):
            f = line.split("\t")
            if len(f) < 3:
                continue
            if f[1] in want:
                out[f[1]] = f[2].strip()
            elif f[0] in want_base:
                out.setdefault(want_base[f[0]], f[2].strip())
            if n and n % 50_000_000 == 0:
                log(f"  {n:,} rows scanned ({time.time() - t0:.0f}s), {len(out)} found")
            if len(out) >= len(want):
                break
    log(f"accession2taxid: resolved {len(out)}/{len(want)}")
    return out


# --- main entry used by the converter ----------------------------------------
def resolve_seqids(seqids, a2t_path=None, remote=True):
    """{seqid -> taxid} for as many of `seqids` as possible."""
    result, need_acc = {}, {}
    for sid in seqids:
        tid = embedded_taxid(sid)
        if tid:
            result[sid] = tid
            continue
        acc = accession_of(sid)
        if acc:
            need_acc.setdefault(acc, []).append(sid)
    embedded = len(result)
    got = {}
    a2t_path = a2t_path or os.environ.get("MYTAX_ACCESSION2TAXID")
    if need_acc and a2t_path:
        got.update(resolve_a2t(need_acc.keys(), a2t_path))
    missing = [a for a in need_acc if a not in got]
    if missing and remote:
        got.update(resolve_eutils(missing))
    for acc, tid in got.items():
        for sid in need_acc.get(acc, ()):
            result[sid] = tid
    no_acc = len(seqids) - embedded - sum(len(v) for v in need_acc.values())
    log(f"resolved {len(result)}/{len(seqids)} (embedded {embedded}, looked up {len(result) - embedded}"
        f"{f', {no_acc} ids not accession-like' if no_acc else ''})")
    return result


def append_map(path, mapping):
    """Append new seqid->taxid rows; lock so concurrent jobs don't interleave."""
    if not mapping:
        return True
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "a") as fh:
            try:
                import fcntl
                fcntl.flock(fh, fcntl.LOCK_EX)
            except (ImportError, OSError):
                pass
            fh.write("".join(f"{k}\t{v}\n" for k, v in sorted(mapping.items())))
        return True
    except OSError as e:
        log(f"could not write {path}: {e}")
        return False


def fasta_ids(ref):
    op = gzip.open if ref.endswith(".gz") else open
    with op(ref, "rt") as fh:
        for line in fh:
            if line.startswith(">"):
                yield line[1:].split(None, 1)[0]


def main():
    p = argparse.ArgumentParser(description="Build a seqid2taxid.map for a reference FASTA")
    p.add_argument("--ref", required=True, help="Reference FASTA (.gz ok)")
    p.add_argument("--out", default=None, help="Output map (default: <ref stem>.seqid2taxid.map)")
    p.add_argument("--accession2taxid", default=None, help="Optional NCBI accession2taxid(.gz) for offline lookup")
    p.add_argument("--no-remote", action="store_true", help="Do not query NCBI E-utilities")
    a = p.parse_args()
    stem = a.ref
    for ext in (".fasta.gz", ".fa.gz", ".fna.gz", ".gz", ".fasta", ".fa", ".fna"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
            break
    out = a.out or stem + ".seqid2taxid.map"
    existing = set()
    if os.path.isfile(out):
        with open(out) as fh:
            existing = {l.split()[0] for l in fh if l.strip() and not l.startswith("#")}
    ids = [i for i in dict.fromkeys(fasta_ids(a.ref)) if i not in existing]
    log(f"{len(ids)} sequence id(s) to resolve ({len(existing)} already in {out})")
    m = resolve_seqids(ids, a.accession2taxid, remote=not a.no_remote)
    append_map(out, m)
    log(f"wrote {len(m)} new row(s) -> {out}")


if __name__ == "__main__":
    main()
