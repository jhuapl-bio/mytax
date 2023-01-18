
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
	echo -e ""
}

awk_install() {
	echo -e "" >&2 
	echo -e "       ${RED}Please make sure awk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(awk --version  | head -n1)



# parse input arguments
while getopts "hi:o:c:a:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) NAMES=$OPTARG ;;
		o) OUTPUT=$OPTARG ;;
		c) COLUMN=$OPTARG ;;
		a) ATTRS=$OPTARG ;;
		?) usage; exit ;;
	esac
done
gawk -v ATTRS="$ATTRS" -v COLUMN=$COLUMN  -F '\t|\t'  '
BEGIN{
    split(ATTRS, a, ",")
    for (i=1; i <= length(a); i++) {
        # printf("%s\n", a[i])
        seen[a[i]] = 1
    }
    printf("%s\t%s\t%s\n", "Taxid", "Value","Attribute")
}
{
    if ($COLUMN in seen ){
        # print $0
        printf("%s\t%s\t%s\n", $1,$3,$7)
    }
}'  $NAMES > $OUTPUT
