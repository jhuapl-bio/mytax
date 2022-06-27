file=$1

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
	echo -e "   -i      1 or more kraken report files "
	echo -e "   -o      output kraken2 report file "
	echo -e ""
}

awk_install() {
	echo -e "" >&2 
	echo -e "       ${RED}Please make sure awk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(awk --version  | head -n1)


#---------------------------------------------------------------------------------------------------
# set default values here

#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:o:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) input=$OPTARG ;;
		o) output=$OPTARG ;;
		?) usage; exit ;;
	esac
done

if [[ -z "$awk_version" ]]; then
	echo -e "${RED}Error: awk is not installed${NC}" >&2
	awk_install
	usage
	exit 2
fi
echo "out" $output "in:" $input
# check output arguments
if [[ -z "$output" ]]; then
	echo -e "${RED}Error: specify an output file -o${NC}" >&2
	usage
	exit 2
fi

# check input arguments
if [[ -z "$input" ]]; then
	echo -e "${RED}Error: specify an input kraken report with -i${NC}" >&2
	usage
	exit 2
fi
combine_kreports.py --only-combined --no-headers  -o $output -r  $input

# awk -F $'\t' 'BEGIN {
# 	  i = 0;
#   }
#   {
#     s = ""; 
# 	if ( $5 in ARRAY == 0){
# 		ARRAY[i+1] = $5;
# 		i += 1;
# 	};
#     for (i = 6; i <= NF; i++) s = s $i " ";
#     tax[$5]=s;
#     rank[$5]=$4;
#     assigned[$5]+=$3; 
#     covered[$5]+=$2;
#     total+=$2;
#     depth[$5]=split($6, arr, "  ")
#    }
#    END {
#     for (key in ARRAY){
# 		print(key)
# 	    # printf("%.2f\t%s\t%s\t%s\t%s\t%s\t%s\n", 100*assigned[key]/total, covered[key], assigned[key], rank[key], key, tax[key], depth[key] )
# 	  }
#    }' $input | head
    # | sort -t $'\t' -k 7,7n | cut -f 1-6 
#    > $output
   
    # $input > $output
   