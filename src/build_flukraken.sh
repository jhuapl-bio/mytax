#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: build_flukraken.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script downloads and builds a custom influenza Kraken
# classification database with a mytax taxonomy with the following levels:
#  flu type
#  segment
#  subtype (A type only)
#  host
#  HA clade
#  year
#  strain

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
	echo -e "   -s      pipelines to skip [download, taxonomy, metadata, build ]"
	echo -e "   -w      temporary directory (default: ${CYAN}/tmp${NC})"
	echo -e ""
if [[ 1 -eq 2 ]]; then
	echo -e "  either specify"
	echo -e ""
	echo -e "   -d      download from IVR"
	echo -e ""
	echo -e "  or"
	echo -e ""
	echo -e "   -r      reference FASTA"
	echo -e "   -t      taxonomy"
	echo -e ""
fi
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
offset1=1000000000
offset2=2000000000
download="true"
logfile="/dev/null"
tempdir="/tmp"
prefix=""
BASE=flukraken-$(date "+%F")
CMD="kraken"
SKIPS=()
#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hk:w:t:d:l:x:r:c:s:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		k) BASE=$OPTARG ;;
		r) REFERENCES=$OPTARG ;;
		t) TAXONOMY=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		d) download=$OPTARG ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		s) SKIPS=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments
if [[ -z "$BASE" ]]; then
	echo -e "${RED}Error: specify a kraken database with -k${NC}" >&2
	usage
	exit 2
fi

if [[ -d "$BASE" ]]; then
	echo -e "${YELLOW}Warning: output directory \"$BASE\" already exists.${NC}" >&2
fi

if [[ "$download" == "false" ]]; then
	if ! [[ -d "$TAXONOMY" ]]; then
		echo -e "${RED}Error: must specify a taxonomy with -t if not downloading with -d${NC}" >&2
		usage
		exit 2
	fi
	if ! [[ -e "$REFERENCES" ]]; then
		echo -e "${RED}Error: must specify a reference FASTA file with -r if not downloading with -d${NC}" >&2
		usage
		exit 2
	fi
fi

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

#---------------------------------------------------------------------------------------------------
# set up log file
logfile="$BASE/build_flukraken.log"

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

# create output directory
mkdir -m 775 -p "$BASE"

echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/$(basename $BASE)-$runtime"
mkdir -m 775 -p "$workdir"

echo_log "recording software version numbers"
echo_log "  gawk version: $(gawk --version | head -n1)"
echo_log "  jellyfish version: $(jellyfish --version | head -n1)"
echo_log "  kraken version: $(kraken --version | head -n1)"

if ! [[ -s $(which gawk) && -s $(which jellyfish) && -s $(which kraken) ]]; then
	echo "Error: required packages are not installed" >&2
	usage
	exit 2
fi

echo_log "input arguments"
echo_log "  working directory: ${CYAN}$workdir${NC}"
echo_log "  threads: ${CYAN}1${NC}"
echo_log "output arguments"
echo_log "  kraken directory: ${CYAN}$BASE${NC}"
echo_log "------ building flu-kraken database ------"

#===================================================================================================
# Download data from IVR
#===================================================================================================

if [[ "$download" == "true" ]] && [[ ! " ${SKIPS[@]} " =~ "download" ]]; then

	download_IVR.sh \
		-k "$BASE" \
		-w "$workdir" \
		-l "$logfile" \
		-w "$workdir" \
		-c "$CMD" \
		-x " |  "

	
fi
TAXONOMY="$BASE/taxonomy"
REFERENCES="$BASE/raw/influenza.fna"
#===================================================================================================
# Build metadata table for custom taxonomy
#===================================================================================================

if [[ "$download" == "true" ]] && [[ ! " ${SKIPS[@]} " =~ "metadata" ]]; then
	build_IVR_metadata.sh \
		-i "$BASE/raw/influenza_na.dat" \
		-f "$BASE/raw/influenza.fna" \
		-o "$BASE/raw/annotation_IVR.dat" \
		-l "$logfile" \
		-w "$workdir" \
		-c "$CMD" \
		-x " |  "
fi

#===================================================================================================
# Build flu-specific taxonomy
#===================================================================================================

#-------------------------------------------------
# Create flu-specific taxonomy
if [[ ! " ${SKIPS[@]} " =~ "taxonomy" ]]; then
	build_taxonomy.sh \
		-i "$BASE/raw/annotation_IVR.dat" \
		-t "$TAXONOMY" \
		-1 "$offset1" \
		-2 "$offset2" \
		-l "$logfile" \
		-c "$CMD" \
		-w "$workdir" \
		-x " |  "
fi
#===================================================================================================
# Create Kraken or Centrifuge database
#===================================================================================================

#-------------------------------------------------
# Fix FASTA headers to include new taxids
if [[ ! " ${SKIPS[@]} " =~ "build" ]]; then
	build_krakendb.sh \
		-k "$BASE" \
		-r "$REFERENCES" \
		-2 "$offset2" \
		-l "$logfile" \
		-w "$workdir" \
		-c "$CMD" \
		-x " |  "
fi
#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
