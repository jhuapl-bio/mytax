# README

This is the repository for mytax, a tool for building custom taxonomies, which can aid nucleotide sequence classification.

# Installation

Clone this repo with:

`git clone https://github.com/tmehoke/mytax`

Symbolically link all shell scripts into your path, for example with:

`find mytax/src -name "*.sh" | while read fn; do sudo ln -s $PWD/$fn /usr/local/bin; done`

# Dependencies

 - jellyfish (version 1) - https://www.cbcb.umd.edu/software/jellyfish/
 - kraken (version 1) - https://ccb.jhu.edu/software/kraken/
 - gawk - https://www.gnu.org/software/gawk/manual/html_node/Installation.html
 - perl
 - GNU CoreUtils

 - 16 GB of RAM is needed to build the provided influenza kraken database

# Usage

## Building example

This pipeline is built from a central set of scripts located in the `src` directory

Build flu-kraken example with:

`build_flukraken.sh -k flukraken-$(date +"%F")`

The single script `build_flukraken.sh` functions as an outer wrapper for the influenza classification example using the Kraken classifier published in the mytax paper.


`build_flukraken.sh` can also be used as a model to build modified pipelines as desired.  It is built from four main sub-modules:
```
	download_IVR.sh -> download references and taxonomy from IVR

	build_IVR_metadata.sh -> build tab-delimited metadata table in format for mytax

	build_taxonomy.sh -> build custom taxonomy from tab-delimited table

	build_krakendb.sh -> add new taxonomic IDs to reference FASTA, build kraken database, post-process database for visualization pipeline
```

`build_krakendb.sh` currently references three helper scripts, which also need to be in the PATH:
```
	fix_references.sh -> adds new taxonomic IDs to reference FASTA

	kraken-build -> builds kraken database

	process_krakendb.sh -> post-processes database for visualization pipeline (not included in this repo yet)
```

# License and copyright

Copyright (c) 2019 Thomas Mehoke

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
