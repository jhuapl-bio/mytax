#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: krakenreport2json.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script converts a Kraken report (made through kraken-report)
# to a JSON file that can be easily processed by D3 visualization tools.

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
	echo -e "   -i      kraken report + fullstring (from ${YELLOW}krakenreport_fullstring.sh${NC})"
	echo -e "   -s      taxonomic levels to summarize (default: ${CYAN}summarize all in taxonomy${NC})"
	echo -e "   -o      output file (default: ${CYAN}STDOUT${NC})"
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
logfile="/dev/null"
tempdir="/tmp"
prefix=""

#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:s:o:l:w:x:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) kraken_full=$OPTARG ;;
		s) levels=$OPTARG ;;
		o) output=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		x) prefix=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments
if [[ -z "$kraken_full" ]]; then
	echo -e "${RED}Error: specify a fullstring kraken report with -i${NC}" >&2
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

#---------------------------------------------------------------------------------------------------

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/krakenreport2json-$runtime"
mkdir -m 775 -p "$workdir"

gawk -F $'\t' \
	-v BASENAME="$(basename $0)" \
	-v HOSTNAME="$(hostname)" \
	-v LEVELS="$levels" \
	' function recurse(taxid, children) { if(0 == 1){ print( "Recursive function to create JSON file" ); }

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Get parent ID for this taxid, determine if it has printed children before" ); }
	parent_taxid = parent[taxid];
	if(firstchild[parent_taxid] == 0) {
		printf("\n{\n");
		firstchild[parent_taxid] = taxid;
	} else {
		printf(",\n{\n");
	}

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "For each taxid, print metadata info first" ); }
	printf("\"name\": \"%s\",\n", label[taxid]);
	printf("\"size\": %s,\n", reads[taxid]);
	printf("\"rank\": \"%s\",\n", all_ranks[taxid]);
	for(h in header[taxid]) {
		rank = header[taxid][h];
		if(rank != "no rank") {
			printf("\"%s\": \"%s\",\n", rank, annotation[taxid][h]);
		}
	}
	printf("\"taxid\": %s", taxid);

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Recursive bit to deal with child taxids" ); }

	if(taxid in children) {
		if(0 == 1){ print( "If taxid has children, create children array, recurse" ); }
		printf(",\n\"children\": [", tax);
		for(i in children[taxid]) {
			new_taxid = children[taxid][i];
			recurse(new_taxid, children);
		}
		if(0 == 1){ print( "Close out taxid object once done with children" ); }
		printf("]\n}", tax);
	} else {
		if(0 == 1){ print( "If taxid has no children, close out taxid object" ); }
		printf("\n}");
	}
}
BEGIN {
	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Grab order of levels, if available" ); }
	n = split(LEVELS, level_array, ",");
	for(i=1; i<=n; i++) {
		rank = level_array[i];
		level_order[rank] = i;
	}

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Initialize JSON file" ); }
	printf("{\n\"name\": \"all DNA\",\n\"children\": [\n{");
} {

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Set up header and annotation arrays" ); }
	n = split($7, a, "|")
	split($5, b, ";")
	for(i=1; i<=n; i++) {

		taxid = b[1];
		ann_taxid = gensub(/([0-9]+);(.*)\(([^)(]+)\)/, "\\1", "g", a[i]);
		ann_label = gensub(/([0-9]+);(.*)\(([^)(]+)\)/, "\\2", "g", a[i]);
		ann_rank = gensub(/([0-9]+);(.*)\(([^)(]+)\)/, "\\3", "g", a[i]);

		header[taxid][i+1] = ann_rank;
		annotation[taxid][i+1] = ann_label;
		all_ranks[ann_taxid] = ann_rank;

		if( (length(level_array) > 0 && ann_rank in level_order) || (length(level_array) == 0 && ann_rank != "no rank" && ann_rank != "0;()") ) {
			if(!print_values[ann_rank][ann_label]) {
				print_values[ann_rank][ann_label] = length(print_values[ann_rank]);
			}
		}
	}

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Run through all values in kraken report" ); }
	if(FNR == 1) {
		printf("\n\"name\": \"unclassified\",\n");
		printf("\"size\": %s,\n", $3);
		printf("\"rank\": \"no rank\",\n");
		printf("\"taxid\": 0\n");
		printf("},");
	} else {
		if(0) { "---------------------------------------------------------------"; }
		if(0 == 1){ print( "Parse input line into taxid-based arrays" ); }
		gsub(/^ */, "", $6);
		taxid = $5;
		reads[taxid] = $3;
		label[taxid] = $6;
		fullstring[taxid] = $7;

		for(i=2; i<=(length(header[taxid])+1); i++) {
			value = annotation[taxid][i];
			rank = header[taxid][i];
			count[rank][value] += $3;
		}

		if(0 == 1){ print( "Split fullstring text into current and parent taxid strings" ); }
		len = split(fullstring[taxid], a, "|");
		current_string = a[len];
		parent_string = a[len-1];

		if(0 == 1){ print( "Pull out taxids from current and parent taxid strings" ); }
		split(current_string, b, ";");
		taxid_current = b[1];
		split(parent_string, c, ";");
		taxid_parent = c[1];

		if(0 == 1){ print( "Identify current size of children list for this parent" ); }
		if(taxid_parent in children) {
			l = length(children[taxid_parent]);
		} else {
			l = 0;
		}

		if(0 == 1){ print( "Populate parent and children taxid-based arrays" ); }
		parent[taxid_current] = taxid_parent;
		children[taxid_parent][l+1] = taxid_current;

		if(0 == 1){ print( "Create flag for first child printed for each parent" ); }
		firstchild[taxid_parent] = 0;
	}
} END {

	if(0) { "---------------------------------------------------------------"; }
	if(0 == 1){ print( "Run recursive function starting at the root" ); }
	recurse(1, children);
	printf("],\n");

	if(0) { "---------------------------------------------------------------"; }
	if(0) { "Print attribute information"; }
	printf("\"metadata\": {\n");
	printf("\"attribution\": \"File created by %s on %s\",\n", BASENAME, HOSTNAME);
	printf("\"attribution\": \"Script version: %s\",\n", "0.3");
	printf("\"description\": \"Annotated classification results\",\n");
	printf("\"fields\": {\n");

	if(0) { "---------------------------------------------------------------"; }
	if(0) { "Print values for each attribute"; }
	numLevels = length(print_values);
	i = 0;
	PROCINFO["sorted_in"] = "@ind_num_asc";
	for(rank in print_values) {
		i+=1;
		printf("\"a%s\": {\n", i);
		printf("\"name\": \"%s\",\n", rank);
		if(length(level_array) > 0) {
			printf("\"rank_order\": %s,\n", level_order[rank]);
		}
		printf("\"lookup\": {\n");
		output = "";

		for(j in print_values[rank]) {
			output = sprintf("%s,\n\"%s\":{\"value\":\"%s\",\"count\":%s}", output, print_values[rank][j], j, count[rank][j]);
		}
		printf("%s\n}\n", substr(output, 3));
		if(i < numLevels) {
			printf("},\n");
		} else {
			printf("}\n");
		}
	}

	printf("}\n");
	printf("}\n");
	printf("}\n");

}' "$kraken_full" > "$workdir/output"

if [[ -n "$output" ]]; then
	cp "$workdir/output" "$output"
else
	cat "$workdir/output"
fi

rm -rf "$workdir"
