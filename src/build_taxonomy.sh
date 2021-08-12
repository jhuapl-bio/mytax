#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: build_taxonomy.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script builds a mytax taxonomy from a base taxonomy and metadata table with new levels to add.

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

# usage function
usage() {
	echo -e "usage: ${YELLOW}$0${NC} [options]"
	echo -e ""
	echo -e "OPTIONS:"
	echo -e "   -h      show this message"
	echo -e "   -c      classifier [kraken, centrifuge]"
	echo -e "   -i      input metadata table"
	echo -e "             Format specifications:"
	echo -e "               (to be specified)"
	echo -e "   -t      path to reference taxonomy"
	echo -e "             taxonomy must contain names.dmp and nodes.dmp file"
	echo -e "   -1      offset for taxon IDs for new metadata taxonomy levels (default: ${CYAN}1000000000${NC})"
	echo -e "             Note: this value should be larger than any existing taxon ID in the reference taxonomy"
	echo -e "   -2      offset for taxon IDs for new strain taxonomy level (default: ${CYAN}2000000000${NC})"
	echo -e "             Note: this value must be larger than the space of potential metadata taxon IDs"
	echo -e "             (however, this constraint is not checked yet)"
	echo -e "   -w      working directory (default: ${CYAN}/tmp${NC})"
	echo -e ""
}

gawk_install() {
	echo -e "" >&2
	echo -e "       ${RED}Please make sure gawk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "       Check: ${CYAN}https://www.gnu.org/software/gawk/manual/html_node/Installation.html${NC}" >&2
	echo -e "              for more information" >&2
	echo -e "" >&2
}

#---------------------------------------------------------------------------------------------------
# set default values here
offset1=1000000000
offset2=2000000000
logfile="/dev/null"
tempdir="/tmp"
prefix=""
CMD="kraken"
#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:t:w:1:2:l:x:c:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) metadata=$OPTARG ;;
		t) TAXONOMY=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		1) offset1=$OPTARG ;;
		2) offset2=$OPTARG ;;
		l) logfile=$OPTARG ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# argument checking
if [[ -z "$TAXONOMY" ]]; then
	echo -e "${RED}Error: Please specify a taxonomy directory with -t${NC}" >&2
	usage
	exit 2
fi
if ! [[ -s "$TAXONOMY/names.dmp" ]]; then
	echo "${NC}Error: Specified taxonomy (${CYAN}$TAXONOMY${RED}) does not contain required file (names.dmp)" >&2
	usage
	exit 2
fi
if ! [[ -s "$TAXONOMY/nodes.dmp" ]]; then
	echo "${NC}Error: Specified taxonomy (${CYAN}$TAXONOMY${RED}) does not contain required file (nodes.dmp)" >&2
	usage
	exit 2
fi

#---------------------------------------------------------------------------------------------------
# check required software is installed
gawk_version=$(gawk --version 2> /dev/null | head -n1)

if [[ -z "$gawk_version" ]]; then
	echo -e "${RED}Error: gawk is not installed${NC}" >&2
	gawk_install
	usage
	exit 2
fi

#===================================================================================================
# DEFINE FUNCTIONS
#===================================================================================================

#---------------------------------------------------------------------------------------------------
# log function that will output to STDOUT and a log file
echo_log() {

	input="$*"

	# if input is non-empty string, prepend initial space
	if [[ -n "$input" ]]; then
		input=" $input"
	fi

	# print to STDOUT
	echo -e "[$(date +"%F %T")]$prefix$input"

	# print to log file (after removing color strings)
	echo -e "[$(date +"%F %T")]$prefix$input" | gawk '{ printf("%s\n", gensub(/\x1b\[[0-9;]*m?/, "", "g", $0)); }' >> "$logfile"
}

#---------------------------------------------------------------------------------------------------
# get parent taxids in a taxonomy for a given taxid
get_parent_taxids() {

	taxid="$1"

	gawk -F $'\t' -v TAXID="$taxid" '{
		a[$1] = $3;
	} END {
		taxid = TAXID;
		out = TAXID;
		while(taxid > 1) {
			taxid = a[taxid];
			out = sprintf("%s,%s", taxid, out);
		}
		printf("%s\n", out);
	}' "$nodes.full" | gawk -F $'\t' '{printf("%s\n", gensub(/,/, "\n", "g", $0));}'
}
#---------------------------------------------------------------------------------------------------

#===================================================================================================
# MAIN BODY
#===================================================================================================

# set up log file
echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# set up variables to interact with taxonomy files
names="$TAXONOMY/names"
nodes="$TAXONOMY/nodes"

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/build_taxonomy-$runtime"
mkdir -m 775 -p "$workdir"

if [[ -z "$prefix" ]]; then
	echo_log "input arguments:"
	echo_log "  input metadata file: ${CYAN}$metadata${NC}"
	echo_log "output arguments:"
	echo_log "  output taxonomy directory: ${CYAN}$TAXONOMY${NC}"
	echo_log "  log file: ${CYAN}$logfile${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
fi
echo_log "------ building custom taxonomy ------"


#===================================================================================================
# CREATE TAXONOMY
#===================================================================================================

#-------------------------------------------------
# grab anchor taxids (and path down from the root) from the taxonomy file
echo_log "  Preparing taxonomy for this metadata table"

# store full reference taxonomy files before we subset
mv "$names.dmp" "$names.full"
mv "$nodes.dmp" "$nodes.full"

# grab parent taxids for all anchor taxids in metadata table
tail -n+2 "$metadata" | cut -f2 | sort | uniq | while read taxid; do
	get_parent_taxids "$taxid"
done | sort -n | uniq > "$workdir/anchor_taxids"



# ADD ERROR CHECKING IN CASE ANCHOR TAXIDS ARE NOT PRESENT IN TAXONOMY



# Subset taxonomy to root taxids
gawk -F $'\t' '{if(NR == FNR) {a[$1] = 1;} else {if(a[$1] == 1) {print $0;}}}' "$workdir/anchor_taxids" "$names.full" > "$names.dmp"
gawk -F $'\t' '{if(NR == FNR) {a[$1] = 1;} else {if(a[$1] == 1) {print $0;}}}' "$workdir/anchor_taxids" "$nodes.full" > "$nodes.dmp"

# THERE IS A BUG IN THIS CODE WHEN THERE IS ONLY ONE ELEMENT IN THE TYPE AND SEGMENT FIELDS
echo_log "  Building taxonomy"
gawk -F $'\t' \
	-v OFFSET1="$offset1" \
	-v OFFSET2="$offset2" \
	-v BASE="$BASE" \
	-v NAMES="$names.unsorted" \
	-v NODES="$nodes.unsorted" \
'{
	if(FNR == 1) {

		if(1==0){ print "Grab header values from first line"; }
		num_fields = NF;
		for(column=1; column<=NF; column++) {
			header[column] = $column;
		}

	} else {

		if(1==0){ print "Store metadata values for all rows"; }
		id = $1;
		for(column=1; column<=NF; column++) {
			metadata[column][$column] += 1;
			sequence[id][column] = $column;
			row[id] = FNR - 1;
		}
	}
} END {

	if(1==0){ print "---------------------------------------------"; }
	if(1==0){ print "Calculate array sizes for future calculations"; }

	for(column=3; column<=num_fields; column++) {

		if(1==0){ print "Grab total number of values for this column"; }
		size[column] = length(metadata[column]);

		if(1==0){ print "Grab total number of possible taxids prior to this column"; }
		if(column <= 3) {
			previous[column] = 0;
		} else if(column == 4) {
			previous[column] = OFFSET1;
		} else if(column < num_fields) {
			previous[column] = 1;
			for(k=3; k<column; k++) {
				previous[column] *= size[k];
			}
			previous[column] += previous[column-1];
		} else {
			previous[column] = OFFSET2;
		}

		if(1==0){ print "Store sorted position of this value within its column"; }
		count = 0;
		PROCINFO["sorted_in"] = "@ind_num_asc";
		for(value in metadata[column]) {
			count += 1;
			order[column][value] = count;
		}
		PROCINFO["sorted_in"] = "";
	}

	if(1==0){ print "--------------------------------------"; }
	if(1==0){ print "Add sequences to names and nodes arrays"; }

	for(id in sequence) {

		if(1==0){ print "Go through all metadata columns"; }

		for(column=3; column<=num_fields; column++) {

			value = sequence[id][column];

			if(1==0){ print "Calculate additional offsets needed for this record"; }

			if(column == 3) {
				additional[column] = order[column][value];
			} else if(column < num_fields) {
				additional[column] = (additional[column-1] - 1) * size[column] + order[column][value] - 1; if(1==0){ print "Is the -1 at the end the most accurate way to do this?"; }
			} else if(column == num_fields) {
				additional[column] = OFFSET2 + row[id];
			}

			if(1==0){ print "Calculate parent ID for this record"; }

			if(column == 3) {
				parent = 0;
			} else if(column == 4) {
				parent = sequence[id][2];
			} else if(column > 4) {
				parent = previous[column-1] + additional[column-1];
			}

			if(1==0){ print "Calculate taxid for this record and grab label"; }

			if(column < num_fields) {
				taxid = previous[column] + additional[column];
			} else if(column == num_fields) {
				taxid = additional[column];
			}

			label = header[column];

			if(1==0){ print "Store values in names and nodes arrays"; }

			fasta_header[taxid] = id;
			anchor_taxid[taxid] = sequence[id][2];
			anchor_label[taxid] = sequence[id][3];
			names[taxid] = value;
			nodes[taxid]["parent"] = parent;
			nodes[taxid]["label"] = label;
		}
	}

	if(1==0){ print "-------------------------------------"; }
	if(1==0){ print "Print names and nodes arrays to files"; }

	for(taxid in names) {
		
		if(taxid+0 > OFFSET1) {

			if(1==0){ print "Print taxid attribute values to names and nodes file"; }

			printf("%s\t|\t%s\t|\t\t|\tscientific name\t|\n", taxid, names[taxid]) >> NAMES;
			printf("%s\t|\t%s\t|\t%s\t|\t\t|\t\t|\t\t|\t\t|\t\t|\t\t|\t\t|\t\t|\t\t|\t\t|\n", taxid, nodes[taxid]["parent"], nodes[taxid]["label"]) >> NODES;

			if(taxid+0 > OFFSET2) {
				printf("%s\t|\t%s\t|\t\t|\t%s\t|\n", taxid, fasta_header[taxid], "fasta_header") >> NAMES;
			}

			if(1==0){ print "Print parent attribute values at each level to names file"; }

			value = names[taxid];
			parent = taxid;
			while(parent > 0) {
				if(parent <= OFFSET1) {
					label = "type";
					parent_name = anchor_label[taxid];
				} else {
					label = nodes[parent]["label"];
					parent_name = names[parent];
				}
				printf("%s\t|\t%s\t|\t\t|\t%s\t|\n", taxid, parent_name, label) >> NAMES;
				parent = nodes[parent]["parent"];
			}
		}
	}
}' "$metadata"

sort -T "$workdir" -k1n,1 -k7,7 "$names.unsorted" > "$names.sorted" && rm "$names.unsorted"
sort -T "$workdir" -k1n,1 -k7,7 "$nodes.unsorted" > "$nodes.sorted" && rm "$nodes.unsorted"

cat "$names.sorted" >> "$names.dmp" && rm "$names.sorted"
cat "$nodes.sorted" >> "$nodes.dmp" && rm "$nodes.sorted"

#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
