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
	echo -e "   -o      output kraken2 base path directory "
	echo -e "" 
}

awk_install() {
	echo -e "" >&2
	echo -e "       ${RED}Please make sure awk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(awk --version  | head -n1)

type="single"
additional=""

#---------------------------------------------------------------------------------------------------
# set default values here

#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:o:d:t:s:a:p:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) filepath=$OPTARG ;;
		t) type=$OPTARG ;;
		o) output=$OPTARG ;;
		a) additional=$OPTARG ;;
		s) samplename=$OPTARG ;;
		p) samplepattern=$OPTARG;;
		d) database=$OPTARG ;;
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
	echo -e "${RED}Error: specify an input kraken fastq file with -i OR sampleane with -s and paired end read ext with -p${NC}" >&2
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
reportName=$(basename $filepath)
if [[ $samplepattern != '' ]]; then 	
	parsed=$( echo $reportName | sed "s/${samplepattern}//g")
else 
	parsed="${reportName%.*}"
fi 
# parsed=$reportName
outputBase=$output"/$parsed"
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

mkdir -p ${output}

echo "kraken2 --db ${database} --output ${outputAssigned} $additional --report ${outputReport} $paired ${filepath} "

kraken2 --db ${database} --output ${outputBase}.out $additional --report ${outputBase}.report $paired ${filepath} 

files=$( find ${output} -name "*report" -not -name "full.report" )
fullReport="${output}/full.report"
echo "Combining all reports into aggregated report file $outputCombinedReport"

if [[ -s ${fullReport} ]]; then 
	echo "found existing full report" ${fullReport} 
	bash ${__dirname}/combine.sh -i "${outputReport} $fullReport" -o $fullReport
else 
	cp ${outputReport} $fullReport
fi 


# if [[ -s $outputFullOut ]]; then
# 	s="${outputBase}.out $outputFullOut"
# 	cat ${outputBase}.out >> $outputFullOut 
# 	cat $outputFullOut  | sort | uniq  >  "$outputFullOut".tmp 
# 	mv  "$outputFullOut".tmp  $outputFullOut
# else 
# 	s="${outputBase}.out" 
# 	cp $s $outputFullOut
# fi
# if [[ -s $outputCombinedReport ]]; then
# 	echo "bash ${__dirname}/combine.sh  -o $outputCombinedReport -i \"$(find $output/reports -maxdepth 1 -path "*.report" -print0  | tr '\0' ' ' )\" "
# 	bash ${__dirname}/combine.sh -o $outputCombinedReport -i "$(find $output/reports -maxdepth 1 -path "*.report" -print0  | tr '\0' ' ' ) " 
# 	# cp $outputCombinedReport $outputLastReport
# else 
# 	s="${outputBase}.report"
# 	cp $s $outputCombinedReport
# fi
# for file in $files; do    
# 	s="$s $file"
# done  








# echo "Generating Hierarchy File"
# python3 ${__dirname}/generate_hierarchy.py -o "${output}/classifications.full.fullstring" --report "${output}/classifications.full.report"  -taxdump "${taxonomy}";
# echo "Generating JSON File for visualizations"
# bash ${__dirname}/krakenreport2json.sh -i "${output}/classifications.full.fullstring" -o "${output}/classifications.full.json" -m "$f";