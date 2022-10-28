#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: fix_references.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script adds mytax-created taxonomic IDs to the reference FASTA
# and also fixes the formatting of the file.

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
	echo -e "   -k      kraken database directory"
	echo -e "   -r      reference FASTA file"
	echo -e "   -t      taxonomy (default: ${CYAN}taxonomy sub-folder in kraken database directory${NC})"
	echo -e "   -2      offset for taxon IDs for new metadata taxonomy levels (default: ${CYAN}2000000000${NC})"
	echo -e "             Note: this value should be larger than any existing NCBI taxon ID"
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
while getopts "hk:r:2:l:w:x:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		k) BASE=$OPTARG ;;
		r) REFERENCES=$OPTARG ;;
		2) offset2=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		x) prefix=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments

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
# remove line breaks from the sequences in a FASTA file
fasta_rmlinebreaks_2col() {

	input="$*"

	gawk '{
		if(NR == 1) {
			printf("%s\t", $0);
		} else {
			if(substr($0,1,1) == ">") {
				printf("\n%s\t", $0);
			} else {
				printf("%s", $0);
			}
		}
	} END {
		printf("\n");
	}' "$input"

}

#===================================================================================================
# MAIN BODY
#===================================================================================================

echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/fix_references-$runtime"
mkdir -m 775 -p "$workdir"

# name output FASTA file
reference_base=$(basename "$REFERENCES")
reference_fixed="$BASE/library/${reference_base%.*}-fixed.fna"

if [[ -z "$prefix" ]]; then
	echo_log "recording software version numbers"
	echo_log "  gawk version: $gawk_version"
	echo_log "input arguments"
	echo_log "  Kraken directory: ${CYAN}$BASE${NC}"
	echo_log "  reference FASTA: ${CYAN}$REFERENCES${NC}"
	echo_log "  threads: ${CYAN}1${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
	echo_log "output arguments"
	echo_log "  fixed reference FASTA: ${CYAN}$reference_fixed${NC}"
	echo_log "  log file: ${CYAN}$logfile${NC}"
fi
echo_log "------ fixing reference FASTA headers ------"

#---------------------------------------------------------------------------------------------------

# create output directory
mkdir -m 775 -p "$BASE/library"

# create taxid mapping file
echo_log "  Creating taxid mapping file"
gawk -F $'\t' -v OFFSET2="$offset2" '{
	if($1 > OFFSET2) {
		a[$1][$7] = $3;
	}
} END {
	for(taxid in a) {
		printf("%s\t%s\n", a[taxid]["fasta_header"], taxid);
	}
}' "$BASE/taxonomy/names.dmp" > "$workdir/header2taxid"

# fix input FASTA
echo_log "  Formatting input FASTA"
fasta_fixed=$workdir/$(basename "${REFERENCES%.*}").fixed
fasta_rmlinebreaks_2col "$REFERENCES" > "$fasta_fixed"

# fix FASTA headers
echo_log "  Fixing FASTA headers"
gawk -F $'\t' '{
	if(NR == FNR) {
		taxid[$1] = $2;
	} else {
		split($1, header, " ");
		fasta_header = substr(header[1], 2);
		if(taxid[fasta_header]) {
			printf(">kraken:taxid|%s|%s\n%s\n", taxid[fasta_header], substr($1, 2), $2);
		}
	}
}' "$workdir/header2taxid" "$fasta_fixed" > "$reference_fixed"

# create preliminary mapping file (required for kraken-build)
echo_log "  Creating preliminary map file (required for kraken-build)"
gawk -F" " '{
	if(NR%2 == 1) {
		split($1, header, "|");
		printf("TAXID\t%s\t%s\n", substr($1, 2), header[2]);
	}
}' "$reference_fixed" > "$BASE/library/prelim_map.txt"

#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
