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
	echo -e "Creating a taxonomy.tab for a buggy krona script, primarily for the custom taxids from this repo"
	echo -e "OPTIONS:"
	echo -e "   -h      show this message"
	echo -e "   -i      names.dmp and nodes.dmp containing directory"
	echo -e "   -o      output taxonomy.tab file. Default is the same location as the -i parameter "
	echo -e ""
}

gawk_install() {
	echo -e "" >&2 
	echo -e "       ${RED}Please make sure gawk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "" >&2
}
awk_version=$(gawk --version  | head -n1)


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
# check input arguments
if [[ -z "$output" ]]; then
	echo -e "${CYAN}Warning: no output path for tab file specified, putting in -i ${input} ${NC}" >&2
    output="$input/taxonomy.tab"
fi
if [[ -z "$input" ]]; then
	echo -e "${RED}ERROR: no input path that contains a names and nodes dmp file -i ${input} ${NC}" >&2
	usage
	exit 2
fi

if [[ ! -s "$input/names.dmp" ]] || [[ ! -s "$input/nodes.dmp" ]]; then
	echo -e "${RED}ERROR: names or nodes.dmp file dont exist in $input -i ${input}, exiting.... ${NC}" >&2
	usage
	exit 2
fi
echo $input
echo $output


# names.dmp file
#1 is taxid (current)
#2 is the text label of taxid
#3 is category of  (current) e.g. synonym, common name, scientific name, etc

# nodes.dmp file
# 1 is child taxid (current)
# 2 is parent taxid 
# 3 is tax rank of child (current)

gawk -F "\t" '
    {
        if ( NR==FNR){
            mapping[$3][$1] = $5
            chmap[$1] = $3
        } else {
            if ($7 == "scientific name"){
                names[$1] = $3
            }
        }
       
    } END {
        i=0
        for (parent in mapping){
            for (child in mapping[parent]){
                d=0
                lasttaxid=parent
                while (lasttaxid != 0 && lasttaxid != 1){
                    if (lasttaxid in chmap){
                        lasttaxid = chmap[lasttaxid]
                        d+=1
                    } else {
                        print child parent "is 0"
                        lasttaxid = 0
                    }
                }
                # print child"\t"d"\t"parent"\t"mapping[parent][child]"\t"names[child]
                i+=1
            }
        }
    }

' $input/nodes.dmp $input/names.dmp  
#  > $output