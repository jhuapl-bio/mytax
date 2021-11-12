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

## Running process script on kraken/kraken2 report and outfiles

### If running from Docker

docker build . -t jhuaplbio/mytax

Unix

`docker container run -it --rm -v $PWD:/data jhuaplbio/mytax bash`

Windows Powershell

`docker container run -it --rm -v $pwd:/data jhuaplbio/mytax bash`

```

# Run the installation script


# Activate the env, this will contain kraken2 and centrifuge scripts to build the database if needed as well as kraken2 and centrifuge dependencies

conda activate mytax

## Lets make a sample.fastq from test-data

# Kraken1 and Centrifuge must be compiled from scratch, due to issues with libraries/binaries on compilation and execution 

bash install.sh


# first, download ncbi taxdump

python3 src/generate_hierarchy.py -o $PWD/taxdump --report test-data/sample.report   -download 
rm taxdump.tar.gz

# create the kraken output first, (report and outfile)

## DEPRECATED Kraken 1 

mkdir -p databases/minikraken1
wget https://ccb.jhu.edu/software/kraken/dl/minikraken_20171019_4GB.tgz -O databases/minikraken1.tgz
tar -xvzf databases/minikraken1.tgz --directory databases/

export kraken1db=databases/minikraken_20171013_4GB && \
kraken --db $kraken1db --output test-data/sample.out test-data/sample.fastq && \
kraken-report --db $kraken1db  test-data/sample.out | tee  test-data/sample.report



## Also, use kraken 2
## export kraken2db to env variable

### IF you've made flukraken2 in tmp or....
export KRAKEN2_DEFAULT_DB="tmp/flukraken2

### IF you have a pre-made minikraken/other kraken db ready 
export KRAKEN2_DEFAULT_DB="databases/minikraken2_v2_8GB_201904_UPDATE" && \ 
kraken2  --output test-data/sample.out  --report test-data/sample.report test-data/sample.fastq


### if you need minikraken2
mkdir -p databases/
wget ftp://ftp.ccb.jhu.edu/pub/data/kraken2_dbs/old/minikraken2_v2_8GB_201904.tgz -O databases/minikraken2.tgz
tar -xvzf databases/minikraken2.tgz --directory databases/ 

## User Centrifuge 

### Install centrifuge

bash install.sh

### Set up centrifuge env

mkdir -p databases/centrifuge
wget https://genome-idx.s3.amazonaws.com/centrifuge/p_compressed%2Bh%2Bv.tar.gz -O databases/centrifuge.tgz
tar -xvzf databases/centrifuge.tgz --directory databases/centrifuge/



export centrifugedb=databases/  # example
## run classify 
## If you need to make a new database, see here: $CONDA_PREFIX/lib/centrifuge/centrifuge-build --taxonomy-tree taxdump/nodes.dmp --name-table taxdump/names.dmp  sample.fastq sample

$CONDA_PREFIX/lib/centrifuge/centrifuge -f -x databases/centrifuge/p_compressed+h+v  -q test-data/sample.fastq  --report test-data/sample.centrifuge.report > test-data/sample.out
$CONDA_PREFIX/lib/centrifuge/centrifuge-kreport  -x databases/centrifuge/p_compressed+h+v test-data/sample.centrifuge.report > test-data/sample.report



 # Next, generate the hierarchy json file
python3 src/generate_hierarchy.py \
-o $PWD/test-data/sample.fullstring \
--report test-data/sample.report \
-taxdump taxdump/nodes.dmp


#Get the json for mytax sunburst plot 

bash krakenreport2json.sh -i test-data/sample.fullstring -o test-data/sample.json



```

The resulting file can then imported into the sunburst plot at `sunburst/index.html` rendered with a simple `http.server` protocol 

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
