
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
	echo -e "   -i      names.dmp file from ncbi taxonomy or something in the same format"
	echo -e "   -c      list of attributes to grab from names.dmp, separated by a comma (,)"
	echo -e "   -o      taxid to name(s) mapping file, tsv format"
	echo -e "   -v      column with which the mapping value is e.g. humans, purple bacteria etc"
	echo -e "   -m      File to merge the names into"
	echo -e "   -d      delimiter. default is tab"
	echo -e "   -a      list of attribute values to filter on within the mapping file e.g. synonym, common name"
	echo -e "Map and/or merge a names.dmp or .tsv file to a list of taxids from a kraken2 report format file -i. If the latter file type (tsv) is used, asssumes that the first column, delimited by the -d arg, is the taxid to map/or output"
	echo -e "Kraken2 reports MUST have the taxid in column 5 and names of taxid in column six"
}

awk_install() {
	echo -e "" >&2 
	echo -e "       ${RED}Please make sure awk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(awk --version  | head -n1)
delim="\t|\t"
COLUMN=7
VALUE=3
# parse input arguments
while getopts "hi:o:c:a:d:m:v:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) NAMES=$OPTARG ;;
		o) OUTPUT=$OPTARG ;;
		c) COLUMN=$OPTARG ;;
		d) delim=$OPTARG ;;
		a) ATTRS=$OPTARG ;;
		m) MERGE=$OPTARG ;;
		v) VALUE=$OPTARG ;;
		?) usage; exit ;;
	esac
done



if [[ ! -z "$MERGE" ]] && [[ ! -f $MERGE ]]; then
	echo -e "${RED}Error: specify a valid output file to merge with -m${NC}" >&2
	usage
	exit 2
elif [[  -z $MERGE ]]; then 
	echo -e "${YELLOW}No merge file specified with -m, skipping"   
fi
if [[ ! -z $ATTRS ]]; then
	echo -e "${GREEN}Attrs specified ${ATTRS}, pull from dmp/tsv file and then merge. Assumes that column value and attribute of $ATTRS are separate columns, delimited by the $delim (-d) parameter"    
else 
	echo -e "${GREEN}No attributes are mentioned, assuming a direct mapping file as input"   
fi 



gawk -v ATTRS="$ATTRS" -v MERGE=$MERGE -v COLUMN=$COLUMN -v VALUE=$VALUE -F $delim '
BEGIN{
	i=0
	if (ATTRS){
		split(ATTRS, a, ",")
		for (i=1; i <= length(a); i++) {
			# printf("%s:::\n", a[i])
			# print a[i]
			seen[a[i]] = 1
		}
	}  
    # printf("%s\t%s\t%s\n", "Taxid", "Value","Attribute")
}
{
	if ( NR==FNR){
		if (ATTRS){
			if ($COLUMN in seen ){
				taxids[$1] = $VALUE" ("$COLUMN")"", "taxids[$1]
			}
		} else {
			taxids[$1] = $VALUE", "taxids[$1]
		}
	} else {
		i=i+1
		order[i] = $5
		if (taxids[$5]){
			split($6, arr, ";" )
			reports[$5] =  $1"\t"$2"\t"$3"\t"$4"\t"$5"\t"arr[1]";"substr(taxids[$5], 1, length(taxids[$5])-2)
		}
		else {
			reports[$5] = $0
		}
	}
} END {
	if (MERGE){
		# print "Merging with " MERGE
		for (i = 1; i <= length(order); ++i){
			taxid=order[i]
			printf("%s\n", reports[taxid]  )
		}
	}
	else {	
		# printf("%s\t%s\t%s\n", "Taxid", "Value","Attribute")
		# print "No Merge taking place"
		for (f in taxids){
			printf("%s\t%s\n", f, substr(taxids[f], 1, length(taxids[f])-2))
		}
	}
}


'  $NAMES  $MERGE     > $OUTPUT
