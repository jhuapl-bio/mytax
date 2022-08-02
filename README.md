# mytax2

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
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



## Samplesheet input

You will need to create a samplesheet with information about the samples you would like to analyse before running the pipeline. Use this parameter to specify its location. It has to be a comma-separated file with 3 columns, and a header row as shown in the examples below. By default, it will always look in the `/data/Samplesheet.csv` file for your desired deployment method. For example, in `dev` mode it will be `public/data/Samplesheet.csv`, for production (like in a Docker container running `nginx` like what is described below) it is in `<path_to_dist>/data/Samplesheet.csv`. If you want to check if it is accesible, you can access it at the localhost and port with the path like `localhost:8080/data/Samplesheet.csv` (this is the default dev port)

The Samplesheet should look like (example below) this

```console
sample,path_1,path_2,format,platform,database,compressed
NB11,<path_to_directory>/NB11,,directory,oxford,<path_to_database_directory>/flukraken2,
NB03,<path_to_directory>/NB03,,directory,oxford,<path_to_database_directory>/flukraken2,
ERR6913101,<path_to_directory>/ERR6913101_1.fastq.gz,<path_to_directory>/ERR6913101_2.fastq.gz,file,illumina,<path_to_database_directory>/flukraken2,
ERR6913102,<path_to_directory>/ERR6913102_1.fastq.gz,<path_to_directory>/ERR6913102_2.fastq.gz,file,illumina,<path_to_database_directory>/flukraken2,
flu_bc01,<path_to_directory>/flu_BC01.fastq,,file,oxford,<path_to_database_directory>/flukraken2,
sample,<path_to_directory>/sample_metagenome.fastq,,file,oxford,<path_to_database_directory>/flukraken2,
test,test2.fastq,,file,illumina,<path_to_database_directory>/flukraken2,
```



| Column     | Description                                                                                                                                                                            |
| ---------  | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample`   | Custom sample name. This entry will be identical for multiple sequencing libraries/runs from the same sample. Spaces in sample names are automatically converted to underscores (`_`). |
| `path_1`  | Full path to FastQ file for Illumina short reads 1 OR OXFORD reads. File has to be gzipped and have the extension ".fastq.gz" or ".fq.gz".                                             |
| `path_2`  | Full path to FastQ file for Illumina short reads 2. File has to be gzipped and have the extension ".fastq.gz" or ".fq.gz".                                                             |
| `format`  | TRUE/FALSE, is the row attributed to a demultiplexed barcode folder of 1 or more fastq files or is it a single file that is .gz?                                                       |
| `platform` | Platform used, [ILLUMINA, OXFORD]                                                            |
| `compressed`     | TRUE/FALSE, is your set of files compressed or not as `.gz` format column                                                                                       |

An [example samplesheet](../examples/Samplesheet.csv) has been provided with the pipeline alongside some demo data.

## Creating a Docker image

```
conda activate mytax2

npm run build;

docker build . -t jhuaplbio/basestack_mytax2; 

```

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

