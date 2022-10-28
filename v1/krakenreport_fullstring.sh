#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: krakenreport_fullstring.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script adds the full taxonomic string to the last column of a Kraken report file

#---------------------------------------------------------------------------------------------------
# LICENSE AND DISCLAIMER
#
# Copyright (c) 2019 Thomas Mehoke

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

#---------------------------------------------------------------------------------------------------

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

#-------------------------------------------------
usage() {
	echo -e "usage: ${YELLOW}$0${NC} [options]"
	echo -e ""
	echo -e "OPTIONS:"
	echo -e "   -h      show this message"
	echo -e "   -i      output file from kraken-report (or kraken-report-modif)"
	echo -e "   -k      Kraken database folder (path)"
	echo -e "   -u      ignore unclassified results (taxid = 0)"
	echo -e "   -o      file to place text output file"
	echo -e ""
}

#-------------------------------------------------
create() {
cat << EOF

Create joined.full in your taxonomy folder
from names.dmp and nodes.dmp as follows:

	gawk '{
		gsub(/\t\|(\t)?/, "@", $0);
		split($0, a, "@");
		if(NR == FNR) {
			LIST[a[1]];
			if(a[4] == "scientific name") {
				name[a[1]] = a[2];
			}
		} else {
			parent[a[1]] = a[2];
			level[a[1]] = a[3];
		}
	} END {
		for(TAXID in LIST) {
			out = sprintf("%s;%s(%s)", TAXID, name[TAXID], level[TAXID]);
			if(TAXID > 1) {
				PARENT = parent[TAXID];
				out = sprintf("%s;%s(%s)|%s", PARENT, name[PARENT], level[PARENT], out);
				while(PARENT > 1) {
					PARENT = parent[PARENT];
					out = sprintf("%s;%s(%s)|%s", PARENT, name[PARENT], level[PARENT], out);
				}
			}
			printf("%s\t%s\t%s\t%s\t%s\n", TAXID, parent[TAXID], name[TAXID], level[TAXID], out);
		}
	}' names.dmp nodes.dmp | sort -k1,1 > joined.full

EOF
}

#-------------------------------------------------
# set default values
ignore="false"
tempdir="/tmp"
outputfile=""

# parse input arguments
while getopts "hi:k:uw:d:o:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) input=$OPTARG ;;
		k) DB=$OPTARG ;;
		u) ignore="true" ;;
		w) tempdir=$OPTARG ;;
		o) outputfile=$OPTARG ;;
		?) usage; exit ;;
	esac
done

# if necessary arguments are not present, display usage info and exit
if [[ -z "$input" ]]; then
	echo -e "Specify a Kraken output file with -i" >&2
	usage
	exit 2
fi
if [[ -z "$DB" ]]; then
	echo -e "Select a kraken database with -k" >&2
	usage
	exit 2
fi
if ! [[ -s "$DB/taxonomy/joined.full" ]]; then
	echo -e "${RED}Error: Taxonomy path \"$DB/taxonomy\" does not contain joined.full${NC}" >&2
	echo -e "       Please process kraken directory with ${YELLOW}process_krakendb.sh${NC} to create this file," >&2
	echo -e "       or use the following code:" >&2
	create
	exit 3
fi

# FORMAT CHECKING TO MAKE SURE THIS IS A KRAKEN OUTPUT FILE

#===================================================================================================
# function declarations

#-------------------------------------------------
fix_one() {

	awk -F $'\t' '{
		if($7 ~ /\(species\)/ && $7 ~ /\(no rank\)$/){printf "%s\t%s\t%s\tSSS\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(subkingdom\)$/){printf "%s\t%s\t%s\tKK\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(superphylum\)$/){printf "%s\t%s\t%s\tSP\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(subphylum\)$/){printf "%s\t%s\t%s\tPP\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(subclass\)$/){printf "%s\t%s\t%s\tCC\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(suborder\)$/){printf "%s\t%s\t%s\tOO\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\((subfamily|tribe)\)$/){printf "%s\t%s\t%s\tFF\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(species group\)$/){printf "%s\t%s\t%s\tGG\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(species subgroup\)$/){printf "%s\t%s\t%s\tGGG\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else if($7 ~ /\(subspecies\)$/){printf "%s\t%s\t%s\tSS\t%s\t%s\t%s\n", $1, $2, $3, $5, $6, $7}
		else {print $0}
	}'
}

#===================================================================================================

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/krakenreport_fullstring-$runtime"
mkdir -m 775 -p "$workdir"

OUTPUT="$workdir/output"

# make sure these files maintain the same order
gawk -F $'\t' '{
	if(NR == FNR) {
		taxid=$5;
		line[taxid] = FNR;
		pct[taxid] = $1;
		reads_cumulative[taxid] = $2;
		reads_thislevel[taxid] = $3;
		level_string[taxid] = $4;
		label[taxid] = $6;
	} else {
		taxid=$1;
		fullstring=$5;
		if(taxid in label) {
			printf("%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", line[taxid], pct[taxid], reads_cumulative[taxid], reads_thislevel[taxid], level_string[taxid], taxid, label[taxid], $5);
		}
	}
}' "$input" "$DB/taxonomy/joined.full" | sort -k1n,1 | cut -f2- | fix_one > "$OUTPUT"

if [[ -z "$outputfile" ]]; then
	# output to STDOUT
	cat "$OUTPUT"
else
	# or output to output file specified by -o argument
	mv "$OUTPUT" "$outputfile"
fi

rm -rf "$workdir"

#~~eof~~#
