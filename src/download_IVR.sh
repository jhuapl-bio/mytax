#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: download_IVR.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script downloads:
#    the raw FASTA file and metadata information from the Influenza Virus Resource
#    along with the NCBI taxonomy

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
	echo -e "   -k      directory to build kraken database"
	echo -e "   -c      classifier used [kraken, centrifuge]"
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
FTP="ftp://ftp.ncbi.nih.gov"
logfile="/dev/null"
tempdir="/tmp"
prefix=""
CMD="kraken"
#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hk:l:w:x:c:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		k) BASE=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments
if [[ -z "$BASE" ]]; then
	echo "Error: specify a kraken database with -k" >&2
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
#---------------------------------------------------------------------------------------------------

#===================================================================================================
# MAIN BODY
#===================================================================================================

# set up log file
echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# create directory structure for kraken database
mkdir -m 775 -p "$BASE/"{taxonomy,raw}

# create directory to hold temporary files
runtime=$(date +"%Y%m%d-%H%M%S-%N")
workdir="$tempdir/$(basename $BASE)-$runtime"
mkdir -m 775 -p "$workdir"

if [[ -z "$prefix" ]]; then
	echo_log "recording software version numbers"
	echo_log "  gawk version: $gawk_version"
	echo_log "input arguments:"
	echo_log "  kraken directory: ${CYAN}$BASE${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
	echo_log "  threads: ${CYAN}1${NC}"
fi
echo_log "------ downloading files for Influenza kraken DB ------"

#-------------------------------------------------
# Download influenza data

echo_log "  Downloading FASTA and metadata from the Influenza Virus Resource:"
echo_log "    $FTP/genomes/INFLUENZA/"

wget -q "$FTP/genomes/INFLUENZA/influenza.fna.gz" -O "$workdir/influenza.fna.gz"
wget -q "$FTP/genomes/INFLUENZA/influenza_na.dat.gz" -O "$workdir/influenza_na.dat.gz"

gzip -d "$workdir/influenza.fna.gz" --stdout > "$BASE/raw/influenza.fna"
gzip -d "$workdir/influenza_na.dat.gz" --stdout > "$BASE/raw/influenza_na.dat"




#-------------------------------------------------
# Grab full NCBI taxonomy

echo_log "  Downloading taxonomy data from NCBI:"
echo_log "    $FTP/pub/taxonomy/"

wget -q "$FTP/pub/taxonomy/taxdump.tar.gz" -O "$workdir/taxdump.tar.gz"

tar --directory "$BASE/taxonomy" -xzf "$workdir/taxdump.tar.gz"


if [ $CMD == 'centrifuge' ]; then
	cat "$BASE/raw/influenza.fna" | awk -F '|' 'BEGIN{OFS="|"}{if($0 ~ /^>/){ print ">"$(NF-1) } else {print $_} }' > $BASE/"tmp.txt"
	mv $BASE/"tmp.txt" "$BASE/raw/influenza.fna"	
fi


# remove line breaks and potential carriage returns from FASTA file
fasta_rmlinebreaks_2col "$BASE/raw/influenza.fna" > "$BASE/raw/influenza-fixed.2col"

#-------------------------------------------------

echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
