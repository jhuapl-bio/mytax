// health.mjs
// -----------------------------------------------------------------------------
// Backend dependency health + in-UI installer.
//
// The classifier shells out to external binaries (kraken2, combine_kreports.py
// from KrakenTools) and optional ONT tools (dorado, guppy_barcoder). If any of
// those are missing the run silently fails mid-pipeline. This module:
//   * detects whether each tool is present (+ version + resolved path),
//   * reports OS / arch + conda|mamba availability so the UI can guide the user,
//   * installs the conda-installable tools into the server's ACTIVE environment
//     on request, streaming live logs back over the socket.
//
// Security note: the client only ever sends a dependency `key`. The actual
// package list + channels are looked up from the fixed DEPENDENCIES registry
// below, never taken from the client, so a socket message can't inject an
// arbitrary `conda install <anything>`.
// -----------------------------------------------------------------------------

import { exec, spawn } from 'child_process';
import os from 'os';
import { logger } from './logger.js';
import { broadcastToAllActiveConnections } from './messenger.mjs';

// Run a shell command and resolve a normalized result. Never rejects.
function run(cmd, timeout = 9000) {
    return new Promise((resolve) => {
        exec(cmd, { timeout, windowsHide: true }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                code: err ? (err.code == null ? 1 : err.code) : 0,
                stdout: (stdout || '').toString().trim(),
                stderr: (stderr || '').toString().trim(),
            });
        });
    });
}

// First non-empty line of combined output (version strings land on either fd).
function firstLine(res) {
    const txt = (res.stdout || res.stderr || '').split('\n').map(s => s.trim()).filter(Boolean);
    return txt.length ? txt[0] : null;
}

// -----------------------------------------------------------------------------
// Dependency registry.
//   required    -> drives the aggregate "backend ready" light (red if missing).
//   bin         -> binary located via `command -v` to decide presence.
//   version     -> command run (if present) to surface a version string.
//   conda       -> non-null => offer a one-click install button in the UI.
//   manual/docs -> always shown so users can install by hand if they prefer.
// -----------------------------------------------------------------------------
export const DEPENDENCIES = [
    {
        key: 'kraken2',
        label: 'Kraken2',
        required: true,
        bin: 'kraken2',
        version: 'kraken2 --version',
        conda: ['kraken2'],
        manual: 'conda install -y -c bioconda -c conda-forge kraken2',
        docs: 'https://github.com/DerrickWood/kraken2/wiki/Manual',
        description: 'Core taxonomic classifier. Required to classify any sample.',
    },
    {
        key: 'krakentools',
        label: 'KrakenTools',
        required: true,
        bin: 'combine_kreports.py',
        version: null, // combine_kreports.py has no stable --version flag
        conda: ['krakentools'],
        manual: 'conda install -y -c bioconda krakentools',
        docs: 'https://github.com/jenniferlu717/KrakenTools',
        description: 'Provides combine_kreports.py, used to merge per-file reports into each sample’s full.report.',
    },
    {
        key: 'fastp',
        label: 'fastp',
        required: false,
        bin: 'fastp',
        version: 'fastp --version',
        conda: ['fastp'],
        manual: 'conda install -y -c bioconda fastp',
        docs: 'https://github.com/OpenGene/fastp',
        description: 'Optional low-quality read filtering applied before classification when a sample enables the fastp toggle.',
    },
    {
        key: 'minimap2',
        label: 'minimap2',
        required: false,
        bin: 'minimap2',
        version: 'minimap2 --version',
        conda: ['minimap2'],
        manual: 'conda install -y -c bioconda minimap2',
        docs: 'https://github.com/lh3/minimap2',
        description: 'Optional alternative classifier: aligns reads to a FASTA/MMI reference (converted to a Kraken2-style report).',
    },
    {
        key: 'samtools',
        label: 'samtools',
        required: false,
        bin: 'samtools',
        version: 'samtools --version',
        conda: ['samtools'],
        manual: 'conda install -y -c bioconda samtools',
        docs: 'https://www.htslib.org/',
        description: 'Sorts and indexes the minimap2 BAM output and is read back to tally per-reference hits.',
    },
    {
        key: 'bracken',
        label: 'Bracken',
        required: false,
        bin: 'bracken',
        version: 'bracken -v',
        conda: ['bracken'],
        manual: 'conda install -y -c bioconda bracken',
        docs: 'https://github.com/jenniferlu717/Bracken',
        description: 'Optional alternative classifier: re-estimates abundances from a Kraken2 run (needs a Bracken-built database).',
    },
    {
        key: 'conda',
        label: 'Conda / Mamba',
        required: false,
        bin: 'conda',
        version: 'conda --version',
        conda: null, // conda is the installer itself, not installable from here
        manual: 'Install Miniconda: https://docs.conda.io/en/latest/miniconda.html',
        docs: 'https://docs.conda.io/projects/conda/en/stable/user-guide/install/index.html',
        description: 'Package manager used to install the tools above directly from this UI.',
    },
    {
        key: 'dorado',
        label: 'Dorado',
        required: false,
        bin: 'dorado',
        version: 'dorado --version',
        conda: null, // distributed as a standalone binary, not via bioconda
        manual: 'Download a release binary: https://github.com/nanoporetech/dorado/releases',
        docs: 'https://github.com/nanoporetech/dorado',
        description: 'Optional ONT basecaller. Only needed for basecalling workflows.',
    },
    {
        key: 'guppy',
        label: 'Guppy barcoder',
        required: false,
        bin: 'guppy_barcoder',
        version: 'guppy_barcoder --version',
        conda: null, // distributed via Oxford Nanopore, not bioconda
        manual: 'Install via Oxford Nanopore (MinKNOW / community.nanoporetech.com).',
        docs: 'https://community.nanoporetech.com',
        description: 'Optional ONT barcoder used by the barcoding step.',
    },
];

// Probe a single dependency: presence, resolved path, optional version.
export async function checkDependency(dep) {
    const found = await run(`command -v ${dep.bin}`);
    const present = !!(found.ok && found.stdout);
    let version = null;
    let binPath = null;
    if (present) {
        binPath = found.stdout.split('\n')[0].trim();
        if (dep.version) {
            const v = await run(dep.version);
            version = firstLine(v);
        }
    }
    return {
        key: dep.key,
        label: dep.label,
        required: dep.required,
        present,
        version,
        path: binPath,
        installable: !!dep.conda,
        manual: dep.manual,
        docs: dep.docs,
        description: dep.description,
    };
}

// Full snapshot: OS, conda/mamba, every dependency, and an aggregate flag.
export async function getHealth() {
    const dependencies = [];
    for (const dep of DEPENDENCIES) {
        // sequential keeps load light and ordering deterministic for the UI
        // eslint-disable-next-line no-await-in-loop
        dependencies.push(await checkDependency(dep));
    }

    const mamba = await run('command -v mamba');
    const condaDep = dependencies.find(d => d.key === 'conda') || {};

    const requiredMissing = dependencies.filter(d => d.required && !d.present).map(d => d.key);

    return {
        os: {
            platform: process.platform,            // 'darwin' | 'linux' | 'win32'
            arch: os.arch(),                       // 'x64' | 'arm64' ...
            release: os.release(),
            type: os.type(),
        },
        conda: {
            present: !!condaDep.present,
            path: condaDep.path || null,
            version: condaDep.version || null,
            mamba: !!(mamba.ok && mamba.stdout),
            mambaPath: (mamba.ok && mamba.stdout) ? mamba.stdout.split('\n')[0].trim() : null,
            env: process.env.CONDA_DEFAULT_ENV || process.env.CONDA_PREFIX || null,
        },
        dependencies,
        ok: requiredMissing.length === 0,
        requiredMissing,
        installing: _installing,
        ts: Date.now(),
    };
}

// -----------------------------------------------------------------------------
// Installer. One install at a time (guarded by _installing) so concurrent
// clients can't kick off competing conda transactions in the same env.
// -----------------------------------------------------------------------------
let _installing = null; // dependency key currently installing, or null

export function isInstalling() {
    return _installing;
}

function emitLog(key, text) {
    broadcastToAllActiveConnections('installLog', { key, line: text });
}

export async function installDependency(key) {
    const dep = DEPENDENCIES.find(d => d.key === key);
    if (!dep) {
        broadcastToAllActiveConnections('installStatus', { key, ok: false, running: false, error: `Unknown tool '${key}'.` });
        return;
    }
    if (!dep.conda) {
        broadcastToAllActiveConnections('installStatus', {
            key, ok: false, running: false,
            error: `${dep.label} can't be installed automatically. ${dep.manual}`,
        });
        return;
    }
    if (_installing) {
        broadcastToAllActiveConnections('installStatus', {
            key, ok: false, running: false,
            error: `An install (${_installing}) is already running. Please wait for it to finish.`,
        });
        return;
    }

    // Prefer mamba (much faster solver) if it's available, else conda.
    const hasMamba = (await run('command -v mamba')).ok;
    const mgr = hasMamba ? 'mamba' : 'conda';
    const hasMgr = (await run(`command -v ${mgr}`)).ok;
    if (!hasMgr) {
        broadcastToAllActiveConnections('installStatus', {
            key, ok: false, running: false,
            error: 'Neither conda nor mamba was found on PATH. Install Miniconda first, then retry.',
        });
        return;
    }

    _installing = key;
    const args = ['install', '-y', '-c', 'bioconda', '-c', 'conda-forge', ...dep.conda];
    const cmdline = `${mgr} ${args.join(' ')}`;

    broadcastToAllActiveConnections('installStatus', { key, running: true, ok: null, error: null });
    emitLog(key, `$ ${cmdline}\n`);
    logger.info(`[health] installing ${dep.label}: ${cmdline}`);

    let child;
    try {
        child = spawn(mgr, args, { env: process.env });
    } catch (err) {
        _installing = null;
        emitLog(key, `\n[error] ${err.message}\n`);
        broadcastToAllActiveConnections('installStatus', { key, ok: false, running: false, error: err.message });
        return;
    }

    child.stdout.on('data', d => emitLog(key, d.toString()));
    child.stderr.on('data', d => emitLog(key, d.toString()));

    child.on('error', async (err) => {
        _installing = null;
        emitLog(key, `\n[error] ${err.message}\n`);
        logger.error(`[health] install error for ${key}: ${err}`);
        broadcastToAllActiveConnections('installStatus', { key, ok: false, running: false, error: err.message });
        try { broadcastToAllActiveConnections('health', await getHealth()); } catch (e) { logger.error(e); }
    });

    child.on('exit', async (code) => {
        _installing = null;
        emitLog(key, `\n[${mgr}] exited with code ${code}\n`);
        let depNow = null;
        let health = null;
        try {
            health = await getHealth();
            depNow = health.dependencies.find(d => d.key === key);
        } catch (e) {
            logger.error(e);
        }
        const ok = code === 0 && depNow && depNow.present;
        let error = null;
        if (!ok) {
            if (code !== 0) error = `Install exited with code ${code}. See the log above for details.`;
            else if (depNow && !depNow.present) error = 'Install finished but the tool is still not detected on PATH. You may need to restart the server so the new binary is picked up.';
            else error = 'Install did not complete successfully.';
        }
        broadcastToAllActiveConnections('installStatus', { key, ok: !!ok, running: false, code, error });
        if (health) broadcastToAllActiveConnections('health', health);
        logger.info(`[health] install of ${key} finished: ok=${!!ok} code=${code}`);
    });
}
