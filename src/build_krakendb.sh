#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: build_krakendb.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script:
#   fixes a reference FASTA list to include custom mytax taxids
#   builds a Kraken database
#   performs post-processing tasks on Kraken database

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
	echo -e "   -c      Classifier to use: [kraken, centrifuge]"
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
jellyfish_install() {
	echo -e "" >&2
	echo -e "       ${RED}Please make sure jellyfish version 1 is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "       Check: ${CYAN}https://www.cbcb.umd.edu/software/jellyfish/${NC}" >&2
	echo -e "              for more information" >&2
	echo -e "" >&2
	echo -e "       Download: ${CYAN}http://www.cbcb.umd.edu/software/jellyfish/jellyfish-1.1.11.tar.gz${NC}" >&2
	echo -e "                 MD5: dc994ea8b0896156500ea8c648f24846" >&2
	echo -e "" >&2
}
kraken_install() {
	echo -e "" >&2
	echo -e "       ${RED}Please make sure kraken version 1 is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "       Check: ${CYAN}https://ccb.jhu.edu/software/kraken/${NC}" >&2
	echo -e "              for more information" >&2
	echo -e "" >&2
	echo -e "       Clone git repository from: ${CYAN}https://github.com/DerrickWood/kraken.git${NC}" >&2
	echo -e "" >&2
}
#---------------------------------------------------------------------------------------------------
# set default values here
FTP="ftp://ftp.ncbi.nih.gov"
logfile="/dev/null"
tempdir="/tmp"
prefix=""
CMD="kraken"
#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hk:r:t:2:l:w:x:c:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		k) BASE=$OPTARG ;;
		r) REFERENCES=$OPTARG ;;
		t) TAXONOMY=$OPTARG ;;
		2) offset2=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments

# make sure taxonomy is formatted properly (or exists in $BASE)


# make sure reference FASTA headers are formatted properly (or do we have a lookup?)


# make sure Kraken can run


#---------------------------------------------------------------------------------------------------
# check required software is installed
gawk_version=$(gawk --version 2> /dev/null | head -n1)
jellyfish_version=$(jellyfish --version 2> /dev/null | head -n1)
kraken_version=$(kraken --version 2> /dev/null | head -n1)

if [[ -z "$gawk_version" ]]; then
	echo -e "${RED}Error: gawk is not installed${NC}" >&2
	gawk_install
	usage
	exit 2
fi
if [[ -z "$jellyfish_version" ]]; then
	echo -e "${RED}Error: Jellyfish version 1 not installed${NC}" >&2
	jellyfish_install
	usage
	exit 2
elif [[ -z "$(echo "$jellyfish_version" | grep "jellyfish 1")" ]]; then
	echo -e "${RED}Error: A version of jellyfish is installed, but not version 1.${NC}" >&2
	echo -e "       $jellyfish_version" >&2
	jellyfish_install
	usage
	exit 2
fi
if [[ -z "$kraken_version" ]]; then
	echo -e "${RED}Error: Kraken is not installed${NC}" >&2
	kraken_install
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

#===================================================================================================
# MAIN BODY
#===================================================================================================

echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/build_krakendb-$runtime"
mkdir -m 775 -p "$workdir"

if [[ -z "$prefix" ]]; then
	echo_log "recording software version numbers"
	echo_log "  gawk version: $gawk_version"
	echo_log "input arguments"
	echo_log "  Kraken database directory: ${CYAN}$BASE${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
	echo_log "  threads: ${CYAN}1${NC}"
	echo_log "output arguments"
	echo_log "  log file: ${CYAN}$logfile${NC}"
fi
#-------------------------------------------------
# Fix FASTA headers to include new taxids
echo_log "------ fixing reference FASTA ------"
fix_references.sh \
	-k "$BASE" \
	-r "$REFERENCES" \
	-2 "$offset2" \
	-l "$logfile" \
	-w "$workdir" \
	-x "$prefix |  "

# -------------------------------------------------
if [[ $CMD == 'kraken' ]]; then
	# Build kraken database
	echo_log "------ building kraken database ------"
	kraken-build \
		--build \
		--db "$BASE" \
		--threads 1 | while read line; do echo "[$(date +"%F %T")]$prefix |  $line" | tee -a "$logfile"; done
else 
	echo_log "------ building centrifuge database ------"
	cat $BASE/taxonomy/names.dmp | \
		gawk -F '\t[|]\t' 'BEGIN{OFS="\t"}{print $2,$1}'  > $BASE/seqid2taxid.map
	centrifuge-build \
		-p 1 \
		--conversion-table $BASE/seqid2taxid.map \
		--taxonomy-tree $BASE/taxonomy/nodes.dmp \
		--name-table $BASE/taxonomy/names.dmp \
		$REFERENCES \
		flucentrifuge | while read line; do echo "[$(date +"%F %T")]$prefix |  $line" | tee -a "$logfile"; done
fi 
#-------------------------------------------------
# Process Kraken database
echo_log "------ processing kraken database ------"
process_krakendb.sh \
	-k "$BASE" \
	-l "$logfile" \
	-w "$workdir" \
	-s \
	-c $CMD \
	-x "$prefix |  "

#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
