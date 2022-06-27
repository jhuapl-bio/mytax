#!/bin/bash

# rm -r $2/*.fastq

current_data=$(date +"%Y-%m-%d_%H-%M-%S")
find $1 -name "*fastq" | head -n1 | while read line; do 
	# cp $line $2/
	basen=$(basename $line)
	basefilename="${basen%.*}"
	fullname=$basefilename"_${current_data}.fastq"
	rm $2/$basefilename*.fastq
	cp $line $2/$fullname
	sleep 3


done
