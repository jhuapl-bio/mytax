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

## Get minikraken2 database
mkdir -p data/databases

wget ftp://ftp.ccb.jhu.edu/pub/data/kraken2_dbs/old/minikraken2_v2_8GB_201904.tgz -O ./data/databases/minikraken2.tar.gz 
tar -xvzf ./data/databases/minikraken2.tar.gz && rm -rf data/databases/minikraken2.tar.gz
mv minikraken2_v2_8GB_201904_UPDATE data/databases/

### Get the ncbi base taxonomy taxdump file
python3 server/src/generate_hierarchy.py -o data/taxdump -download --report sample.report
database="data/databases/minikraken2_v2_8GB_201904_UPDATE"


### Run the report generation on 2 files, making a merged file in the end
outputBase="example-data/sample_metagenome.first"
filepath="example-data/sample_metagenome.first.fastq"
kraken2 --db ${database} --output ${outputBase}.out   --report ${outputBase}.report ${filepath}; 

outputBase="example-data/sample_metagenome.second"
filepath="example-data/sample_metagenome.second.fastq"
kraken2 --db ${database} --output ${outputBase}.out   --report ${outputBase}.report ${filepath}; 

bash server/src/combine.sh -i "example-data/sample_metagenome.first.report example-data/sample_metagenome.second.report" -o example-data/sample_metagenome.full.report
python3 server/src/generate_hierarchy.py -o example-data/sample_metagenome.full.fullstring --report example-data/sample_metagenome.full.report -taxdump data/taxdump/nodes.dmp
bash server/src/krakenreport2json.sh -i example-data/sample_metagenome.full.fullstring  -o example-data/sample_metagenome.full.json


### Get playback output
python3 server/src/generate_report.py \
-o example-data/NB11.playback.tsv \
-i example-data/sequencing_summary.txt  \
-report example-data/NB11.report \
-out example-data/NB11.out   \
-set_time 2018-08-03T22:56:54Z \
-taxdump data/taxdump/nodes.dmp