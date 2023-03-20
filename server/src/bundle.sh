#!/bin/bash
# define colors for error messages
red='\033[0;31m'
RED='\033[1;31m'
green='\033[0;32m'
GREEN='\033[1;32m'
yellow='\033[0;33m'
YELLOW='\033[1;33m'
blue='\033[0;34m'
BLUE='\033[1;34m'
purple='\033[0;35m'
PURPLE='\033[1;35m'
cyan='\033[0;36m'
CYAN='\033[1;36m'
NC='\033[0m'
# usage function
usage() {
	echo -e "usage: ${YELLOW}$0${NC} [options]"
	echo -e ""
	echo -e "OPTIONS:"
	echo -e "   -h      show this message"
	echo -e "   -i      kraken input fastq(s)"
	echo -e "   -t      type (paired/single)"
	echo -e "   -s      paired pattern for sample"
	echo -e "   -d      database path"
	echo -e "   -a      additional kraken2 specific commands"
	echo -e "   -r      recombine all report files into the full report before merging EXCEPT the current report being made"
	echo -e "   -y      appendable names.tsv designations file (must be in tsv format)"
	echo -e "   -p      appendable names.tsv attributes from -y argument file"
	echo -e "   -c      column in which the attribute is located in -y argument file"
	echo -e "   -v      column in which the value is located in -y argument file"
	echo -e "   -o      output kraken2 file path (absolute is preferred) "
	echo -e "" 
}

awk_install() {
	echo -e "" >&2
	echo -e "       ${RED}Please make sure awk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(awk --version  | head -n1)
column=7
value=5
recombine='false'
type="single"
additional=""

#---------------------------------------------------------------------------------------------------
# set default values here

#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:o:d:t:s:a:p:y:c:v:r" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) filepath=$OPTARG ;;
		t) type=$OPTARG ;;
		o) output=$OPTARG ;;
		a) additional=$OPTARG ;;
		r) recombine='true' ;;
		s) samplename=$OPTARG ;;
		p) namesAttrs=$OPTARG;;
		y) names=$OPTARG;;
		c) column=$OPTARG;;
		d) database=$OPTARG ;;
		v) value=$OPTARG ;;
		?) usage; exit ;;
	esac
done

if [[ -z "$awk_version" ]]; then
	echo -e "${RED}Error: awk is not installed${NC}" >&2
	awk_install
	usage
	exit 2
fi
# check output arguments
if [[ -z "$output" ]]; then
	echo -e "${RED}Error: specify an output file -o${NC}" >&2
	usage
	exit 2
fi

# check input arguments
if [[ -z "$filepath" ]] ; then
	echo -e "${RED}Error: specify an input kraken fastq file with -i OR sampleane with -s and paired end read ext with -p" >&2
	usage
	exit 2
fi

function real {
    if hash realpath; then
        realpath $1
    else
        readlink -f $1
    fi
}

__dirname=$(dirname $0)
parsed=""; 
reportName=$output
if [[ $samplepattern != '' ]]; then 	
	parsed=$( echo $reportName | sed "s/${samplepattern}//g")
else 
	parsed="${reportName%.*}"
fi 
# parsed=$reportName
outputBase=$parsed
echo $reportName $parsed
outputdir=$(dirname $output)
outputReport="${outputBase}.report"
outputAssigned="${outputBase}.out"
# outputCombinedReport=$output"/classifications.full"
# outputLastReport=$output"/classifications.last.report"
# outputFullOut=$output"/classifications.full.out"
# stored_seen=$output"/files_seen.txt"
paired=""

if [[ $type == 'paired' ]]; then
	paired="--paired"
fi 

mkdir -p $outputdir

echo "kraken2 --db ${database} --output ${outputAssigned} $additional --report ${outputReport} $paired ${filepath} "
# alreadyseen=0
# if [[ -f ${outputBase}.report ]]; then
# 	alreadyseen="${outputBase}.report.bk"
# 	cp ${outputBase}.report ${outputBase}.report.bk
# fi



kraken2 --db ${database} --output ${outputBase}.out $additional --report ${outputBase}.report $paired ${filepath} 


if [[ ! -z "$names" ]] ; then
	echo -e "${CYAN}Specified a names file with -p, appending to full.report" 
fi
if [[ ! -z $names ]] && [[  -f ${outputBase}.report ]]; then
	if [[  ! -z $namesAttrs ]]; then
		namesAttrs="-a $namesAttrs"
	else 
	echo "Unset"
		unset namesAttrs
	fi 
	echo $namesAttrs | wc -c
	echo -e "output report exists, $(ls -hlt $outputBase.report)"
	echo -e "$namesAttrs are the identified attributes to map to a taxid"
	echo "$outputBase.merged.report "
	bash ${__dirname}/map_calls.sh \
		-i $names \
		-c $column  \
		-o $outputBase.merged.report \
		-v $value \
		-m ${outputBase}.report "$namesAttrs" 
	if [[  -s $outputBase.merged.report ]]; then
		echo "adjusting to" $outputBase.merged.tsv "from " $outputBase.report
		outputReport=$outputBase.merged.report
	else 
		echo "File doesn't exists $outputBase.merged.tsv, skipping"
	fi 
fi 

files=$( find ${outputdir} -name "*report" -not -name "full.report" )
fullReport="${outputdir}/full.report"



echo "Combining all reports into aggregated report file $outputCombinedReport"

echo "found existing full report" ${fullReport} 
i=0
# if [[ $recombine == 'true' ]]; then 
files=""
for file in $(ls $outputdir/*.report); do 
	basepath=$(basename $file)
	if [[ $file !=  $outputdir"/full.report" ]]; then 
		files=$files" $file"
		i=$(( $i + 1 ))
	fi 
done  
if [[ $files != "" ]]; then 
	combine_kreports.py --only-combined --no-headers  -o $fullReport -r  $files
fi 

# fi 
# if [[ $i == 0 ]]; then
# 	echo "Copying file, no other reports to combine"
# 	cp ${outputReport} $fullReport
# else 
# 	echo "Combining existing report file"
# 	bash ${__dirname}/combine.sh \
# 	-i "${outputReport} $fullReport" \
# 	-o $fullReport 
# fi





# echo "Generating Hierarchy File"
# python3 ${__dirname}/generate_hierarchy.py -o "${output}/classifications.full.fullstring" --report "${output}/classifications.full.report"  -taxdump "${taxonomy}";
# echo "Generating JSON File for visualizations"
# bash ${__dirname}/krakenreport2json.sh -i "${output}/classifications.full.fullstring" -o "${output}/classifications.full.json" -m "$f";
