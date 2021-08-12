#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: process_krakendb.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script processes a Kraken database to add a fullstring file and a k-mer summary.

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
	echo -e "   -k      kraken database (directory)"
	echo -e "   -l      logfile (default: ${CYAN}none${NC})"
	echo -e "   -s      summarize k-mers"
	echo -e "   -w      temporary directory (default: ${CYAN}/tmp${NC}"
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
# set default values
summarize_kmers="false"
logfile="/dev/null"
tempdir="/tmp"
prefix=""
CMD="kraken"
# parse input arguments
while getopts "hk:l:w:sx:c:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		k) BASE=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		s) summarize_kmers="true" ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments
if ! [[ -d "$BASE" ]]; then
	echo -e "${RED}Error: specify a kraken directory with -k${NC}" >&2
	usage
	exit 2
fi

#Make sure that base names and nodes.dmp files are present
if ! [[ -s "$BASE/taxonomy/names.dmp" ]]; then
	echo -e "${RED}Error: specified kraken directory does not contain the required file: ${CYAN}taxonomy/names.dmp${NC}" >&2
	usage
	exit 2
fi
if ! [[ -s "$BASE/taxonomy/nodes.dmp" ]]; then
	echo -e "${RED}Error: specified kraken directory does not contain the required file: ${CYAN}taxonomy/nodes.dmp${NC}" >&2
	usage
	exit 2
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
# get fullstring representation of a taxonomy entry
get_fullstring() {

	names="$1"
	nodes="$2"

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
	}' "$names" "$nodes"
}
#---------------------------------------------------------------------------------------------------

#===================================================================================================
# MAIN BODY
#===================================================================================================

echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/process_krakendb-$runtime"
mkdir -m 775 -p "$workdir"

if [[ -z "$prefix" ]]; then
	echo_log "recording software version numbers"
	echo_log "  gawk version: $gawk_version"
	echo_log "  jellyfish version: $jellyfish_version"
	echo_log "  kraken version: $kraken_version"
	echo_log "input arguments"
	echo_log "  kraken directory: ${CYAN}$BASE${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
	echo_log "  threads: ${CYAN}1${NC}"
	echo_log "output arguments"
	echo_log "  log file: ${CYAN}$logfile${NC}"
fi
echo_log "------ procesing kraken database ------"

#---------------------------------------------------------------------------------------------------
# create joined.full taxonomy file for future reporting
echo_log "  Creating joined taxonomy files"

# add line for unclassified taxid before adding all of the non-zero taxids
echo -e "0\t0\tunclassified\tno rank\t0;unclassified(no rank)" > "$BASE/taxonomy/joined.full"
get_fullstring "$BASE/taxonomy/names.dmp" "$BASE/taxonomy/nodes.dmp" | sort -k1,1 >> "$BASE/taxonomy/joined.full"

#---------------------------------------------------------------------------------------------------
# check that summary is needed

if [[ "$summarize_kmers" == "true" ]] && [ $CMD != 'centrifuge' ]; then
	# make sure kraken database has the required files
	if ! [[ -s "$BASE/database.kdb" ]]; then
		echo -e "${RED}Error: specified kraken directory does not contain the required file: ${CYAN}database.kdb${NC}" >&2
		usage
		exit 2
	fi
	if ! [[ -s "$BASE/database.idx" ]]; then
		echo -e "${RED}Error: specified kraken directory does not contain the required file: ${CYAN}database.idx${NC}" >&2
		usage
		exit 2
	fi
	# dump all k-mers in database
	echo_log "  Extracting all k-mers in database"
	jellyfish dump "$BASE/database.jdb" > "$BASE/database.jdb.dump"

	#---------------------------------------------------------------------------------------------------
	# classify all dumped k-mers through same database
	echo_log "  Classifying all k-mers"
	kraken --db "$BASE" --fasta-input "$BASE/database.jdb.dump" > "$BASE/database.jdb.dump.kraken"

	#---------------------------------------------------------------------------------------------------
	# summarize classified k-mers by rank
	echo_log "  Summarizing k-mers by taxonomic rank"
	gawk -F $'\t' '{
		a[$3] += 1;
	} END {
		for(i in a) {
			printf("%s\t%s\n", i, a[i]);
		}
	}' "$BASE/database.jdb.dump.kraken" > "$BASE/database.jdb.dump.kraken.summary.unique"

	sort -n "$BASE/database.jdb.dump.kraken.summary.unique" > "$BASE/temp" && mv "$BASE/temp" "$BASE/database.jdb.dump.kraken.summary.unique"

	gawk -F $'\t' '{
		if(NR == FNR) {
			level[$1] = $2;
		} else {
			printf("%s\t%s\t%s\n", $1, level[$1], $2);
		}
	}' <(cut -f1,5 "$BASE/taxonomy/nodes.dmp") "$BASE/database.jdb.dump.kraken.summary.unique" > "$BASE/temp" && mv "$BASE/temp" "$BASE/database.jdb.dump.kraken.summary.unique"

	gawk -F $'\t' '{
		a[$2] += $3;
	} END {
		for(i in a) {
			printf("%s\t%s\n", i, a[i]);
		}
	}' "$BASE/database.jdb.dump.kraken.summary.unique" > "$BASE/summary.unique"
fi

#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"

