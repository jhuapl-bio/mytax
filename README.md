# Mytax2 - Realtime reporting

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serveBoth
```

### Adding another CORS port for development use

```
CORS_ADDR=192.168.55.1:7689 npm run serveBoth
```

### Compiles and minifies for production
```
npm run build
```

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).

To add any data, first you must make a run

1. Select "Add Run" and give it a name
2. Then, select the blue and white cross icon on the left-hand side to add a sample. There can be multiple samples were run.
3. Drag + Drop or select a fastq file (or .gz version) into the middle input. You can also input a directory of fastq files. If you want to analyze an entire run of barcodes, you should toggle the switch, which will match any directory in the specified input directory and make 1 sample per match. Alter the pattern matching in the appropriate field.
4. OPTIONAL. IF using paired-end reads, add the R2 file into the top-left input field
5. Select "Add" and the software will automatically start analyzing with Kraken2 and generating the Sunburst plots in realtime. 

### Debugging

Depending on how you are deploying the tool, you can either run:

1. `sudo service mytax2 status` to check the service information
2. Check the command-line logs if hosting/serving in development mode with `npm run serveBoth` or `npm run server`
3. `docker container logs $container_name` if using Docker to deploy



| Column     | Description                                                                                                                                                                            |
| ---------  | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample`   | Custom sample name. This entry will be identical for multiple sequencing libraries/runs from the same sample. Spaces in sample names are automatically converted to underscores (`_`). |
| `path_1`  | Full path to FastQ file for Illumina short reads 1 OR OXFORD reads. File has to be gzipped and have the extension ".fastq.gz" or ".fq.gz".                                             |
| `path_2`  | Full path to FastQ file for Illumina short reads 2. File has to be gzipped and have the extension ".fastq.gz" or ".fq.gz".                                                             |
| `format`  | TRUE/FALSE switch toggle, is the row attributed to a demultiplexed barcode folder of 1 or more fastq files or is it a single file that is .gz?. If toggled on, the entry will auto-detect anything matching the regex-based pattern and make 1 sample per pattern match in that directory. For example, barcode01,02,03, etc.     |
| `pattern` | Pattern to match items (regex) for barcoded runs, Optional                                            |

An [example samplesheet](../examples/Samplesheet.csv) has been provided with the pipeline alongside some demo data.

## Creating a Docker image using the pre-built code.


```
conda activate mytax2

npm run build;

docker build . -t jhuaplbio/basestack_mytax2; 

```

This will first activate the necessary conda env `mytax2`. Then, it will build the compressed and compiled production app. Finally, it will make the Docker image and copy the bundled files into the image for use


## Get minikraken2 database

```
mkdir -p data/databases
wget ftp://ftp.ccb.jhu.edu/pub/data/kraken2_dbs/old/minikraken2_v2_8GB_201904.tgz -O ./data/databases/minikraken2.tar.gz 
tar -xvzf ./data/databases/minikraken2.tar.gz && rm -rf data/databases/minikraken2.tar.gz
mv minikraken2_v2_8GB_201904_UPDATE data/databases/
```


## Running a container with the nginx service at port 8098 on localhost

```
docker container run -it --rm -p 8098:80 jhuaplbio/basestack_mytax2  bash -c "nginx; bash "
```

## Original Mytax v1.0


This is the repository for mytax, a tool for building custom taxonomies, which can aid nucleotide sequence classification.

# Installation

Clone this repo with:

`git clone https://github.com/jhuapl-bio/mytax`

Symbolically link all shell scripts into your path, for example with:

`find v1 -name "*.sh" | while read fn; do sudo ln -s $PWD/$fn /usr/local/bin; done`

# Dependencies

 - jellyfish (version 1) - https://www.cbcb.umd.edu/software/jellyfish/
 - kraken (version 1) - https://ccb.jhu.edu/software/kraken/
 - gawk - https://www.gnu.org/software/gawk/manual/html_node/Installation.html
 - perl
 - GNU CoreUtils

 - 16 GB of RAM is needed to build the provided influenza kraken database

# Usage

## Building example

This pipeline is built from a central set of scripts located in the `v1` directory

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



## Run the installation script


# Activate the env, this will contain kraken2 and centrifuge scripts to build the database if needed as well as kraken2 and centrifuge dependencies

`conda activate mytax`

## Lets make a sample.fastq from test-data

### First, download ncbi taxdump

```
python3 src/generate_hierarchy.py -o $PWD/taxdump --report test-data/sample.report   -download 
rm taxdump.tar.gz
```


### DEPRECATED Kraken1 

```
mkdir -p databases/minikraken1
wget https://ccb.jhu.edu/software/kraken/dl/minikraken_20171019_4GB.tgz -O databases/minikraken1.tgz
tar -xvzf databases/minikraken1.tgz --directory databases/

export kraken1db=databases/minikraken_20171013_4GB && \
kraken --db $kraken1db --output test-data/sample.out test-data/sample.fastq && \
kraken-report --db $kraken1db  test-data/sample.out | tee  test-data/sample.report
```


### Kraken2

### IF you've made flukraken2 in tmp or....

`export KRAKEN2_DEFAULT_DB="tmp/flukraken2`

### IF you have a pre-made minikraken/other kraken db ready 

```
kraken2 --report output/sample_metagenome.first.report --output output/sample_metagenome.first.out --memory-mapping --db ~/Desktop/mytax/minikraken2 example-data/sample_metagenome.first.fastq 
```

### Download minikraken2

```
mkdir -p databases/
wget ftp://ftp.ccb.jhu.edu/pub/data/kraken2_dbs/old/minikraken2_v2_8GB_201904.tgz -O databases/minikraken2.tgz
tar -xvzf databases/minikraken2.tgz --directory databases/ 
```

### Centrifuge 

#### Install 

`bash install.sh`

#### Set up centrifuge env

```
mkdir -p databases/centrifuge
wget https://genome-idx.s3.amazonaws.com/centrifuge/p_compressed%2Bh%2Bv.tar.gz -O databases/centrifuge.tgz
tar -xvzf databases/centrifuge.tgz --directory databases/centrifuge/
```



#### Run Centrifuge classify 

```
## If you need to make a new database, see here: $CONDA_PREFIX/lib/centrifuge/centrifuge-build --taxonomy-tree taxonomy/nodes.dmp --name-table taxonomy/names.dmp  sample.fastq sample

$CONDA_PREFIX/lib/centrifuge/centrifuge -f -x databases/centrifuge/p_compressed+h+v  -q test-data/sample.fastq  --report test-data/sample.centrifuge.report > test-data/sample.out
$CONDA_PREFIX/lib/centrifuge/centrifuge-kreport  -x databases/centrifuge/p_compressed+h+v test-data/sample.centrifuge.report > test-data/sample.report
```

####  Next, generate the hierarchy json file

```
python3 server/src/generate_hierarchy.py \
-o output/sample_metagenome.first.fullstring \
--report output/sample_metagenome.first.report \
-taxdump taxonomy/nodes.dmp
```

#### Get the json for mytax sunburst plot 
```
bash server/src/krakenreport2json.sh -i output/sample_metagenome.first.fullstring -o output/sample_metagenome.first.json
```

The resulting file can then imported into the sunburst plot at `server/src/sunburst/index.html` rendered with a simple `http.server` protocol like `python3 -m http.server 8080`

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

