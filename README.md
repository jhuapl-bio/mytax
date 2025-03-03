# Mytax2 - Realtime reporting


## Project setup

### Create your Conda env first 

```
conda env create -f environment.yml
```

:warning: Make sure if you're on a Mac arm64 processor that you specify you want amd64 like:

```
CONDA_SUBDIR=osx-64 conda env create -f environment.yml
```

### Create npm packages in the repo.

```
npm install
```

## Running the software


### Compiles and hot-reloads for development

```
conda activate mytax2; npm run serveBoth
```

### Adding another CORS port for development use

```
CORS_ADDR=192.168.55.1:7689 npm run serveBoth
```

## Activate the environment

```
conda activate mytax2
```

### Compiles and hot-reloads for development on server
```
npm run server
```


## Building Production package
```
npm run build
```

### Lints and fixes files (development only)
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

