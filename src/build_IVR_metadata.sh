#!/bin/bash

#---------------------------------------------------------------------------------------------------
# script: build_IVR_metadata.sh
# author: Thomas Mehoke (thomas.mehoke@jhuapl.edu)
# source: https://github.com/tmehoke/mytax

# This script builds a custom metadata table from the Influenza Virus Resource
# Producing the following columns:
#  id
#  root taxid in NCBI taxonomy
#  flu type
#  segment
#  subtype
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
	echo -e "    -h     show this message"
	echo -e "    -c      classifier [kraken, centrifuge]"
	echo -e "    -i     input IVR metadata file (influenza_na.dat)"
	echo -e "    -f     input IVR FASTA file (influenza.fna)"
	echo -e "    -o     output metadata table for taxonomy creation"
	echo -e ""
}

gawk_install() {
	echo -e "" >&2
	echo -e "        ${RED}Please make sure gawk is installed.${NC}" >&2
	echo -e "" >&2
	echo -e "        Check: ${CYAN}https://www.gnu.org/software/gawk/manual/html_node/Installation.html${NC}" >&2
	echo -e "             for more information" >&2
	echo -e "" >&2
}

#---------------------------------------------------------------------------------------------------
# set default values here
FTP="ftp://ftp.ncbi.nih.gov"
logfile="/dev/null"
tempdir="/tmp"
prefix=""
outliers="KT777860" # comma-separated list of known outliers to exclude from classification
CMD="kraken"
#---------------------------------------------------------------------------------------------------
# taxid selections
# These are the taxon IDs that we will be saving from the NCBI taxonomy.
# All taxids that are above these (more general) in the hierarchy will also be saved.
taxid_list=(11320 11520 11552 1511084)
species_list=("Influenza_A" "Influenza_B" "Influenza_C" "Influenza_D")

# influenza segment names
inf_A=("PB2" "PB1" "PA" "HA" "NP" "NA" "M" "NS")
inf_B=("PB1" "PB2" "PA" "HA" "NP" "NA" "M" "NS")
inf_C=("PB2" "PB1" "P3" "HE" "NP" "M" "NS")
inf_D=("PB2" "PB1" "P3" "HE" "NP" "M" "NS")

#---------------------------------------------------------------------------------------------------
# parse input arguments
while getopts "hi:f:o:l:w:x:c:" OPTION
do
	case $OPTION in
		h) usage; exit 1 ;;
		i) metadata=$OPTARG ;;
		f) fasta=$OPTARG ;;
		o) output=$OPTARG ;;
		l) logfile=$OPTARG ;;
		w) tempdir=$OPTARG ;;
		x) prefix=$OPTARG ;;
		c) CMD=$OPTARG ;;
		?) usage; exit ;;
	esac
done

#---------------------------------------------------------------------------------------------------
# check input arguments
if ! [[ -s "$metadata" ]]; then
	echo "Error: specify an input metadata file with -i" >&2
	usage
	exit 2
fi
if ! [[ -s "$fasta" ]]; then
	echo "Error: specify an input FASTA file with -f" >&2
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

#===================================================================================================
# MAIN BODY
#===================================================================================================

echo_log "====== Call to ${YELLOW}"$(basename $0)"${NC} from ${GREEN}"$(hostname)"${NC} ======"

# create directory to hold temporary files
runtime=$(date +"%Y%m%d%H%M%S%N")
workdir="$tempdir/build_IVR_metadata-$runtime"
mkdir -m 775 -p "$workdir"

if [[ -z "$prefix" ]]; then
	echo_log "recording software version numbers"
	echo_log "  gawk version: $gawk_version"
	echo_log "input arguments"
	echo_log "  IVR metadata file: ${CYAN}$metadata${NC}"
	echo_log "  working directory: ${CYAN}$workdir${NC}"
	echo_log "  threads: ${CYAN}1${NC}"
	echo_log "output arguments"
	echo_log "  log file: ${CYAN}$logfile${NC}"
	echo_log "  output metadata file: ${CYAN}$output${NC}"
fi
echo_log "------ building influenza virus metadata table from IVR ------"

#===================================================================================================
# BUILD METADATA
#===================================================================================================

#-------------------------------------------------
# fix input FASTA
echo_log "  Checking format of input FASTA..."
fasta_fixed=$workdir/$(basename "${fasta%.*}").fixed
fasta_rmlinebreaks_2col "$fasta" > "$fasta_fixed"

#-------------------------------------------------
# grab annotation columns for taxonomy
echo_log "  Grabbing metadata for custom flu-specific taxonomy..."

gawk -F $'\t' \
	-v A="${inf_A[*]}" \
	-v B="${inf_B[*]}" \
	-v C="${inf_C[*]}" \
	-v D="${inf_D[*]}" \
	-v TAXIDS="${taxid_list[*]}" \
	-v TAXIDLABELS="${species_list[*]}" \
	-v OUTLIERS="$outliers" \
'BEGIN {
	split(A, labelA, " ");
	split(B, labelB, " ");
	split(C, labelC, " ");
	split(D, labelD, " ");
	split(TAXIDS, TAXIDLIST, " ");
	split(TAXIDLABELS, LABELLIST, " ");
	split(OUTLIERS, OUTLIERLIST, " ");
	for(i=1; i<=length(labelA); i++) {
		label["A"][i] = labelA[i];
		label["B"][i] = labelB[i];
		if(i < 8) {
			label["C"][i] = labelC[i];
			label["D"][i] = labelD[i];
		}
	}
	for(i=1; i<=length(TAXIDLIST); i++) {
		type = gensub(/Influenza_/, "", "g", LABELLIST[i]);
		anchor_taxid[type] = TAXIDLIST[i];
	}
	printf("id\troot_taxid\ttype\tsegment\tsubtype\thost\tyear\tstrain\n");
} {
	if(NR==FNR) {
		beginning = gensub(/^>/, "", "g", $1);
		split(beginning, h, " ");
		split(h[1], acc, "|");
		acc_id = h[1]
		header[acc[4]] = acc_id;
		header[acc[1]] = acc_id;
	} else {
		if(!($1 in OUTLIERLIST) && $11 == "c" && $3 ~ /^[0-9]+$/ && $4 ~ /^(H[0-9]+)?(N[0-9]+)?$/ && $6 ~ /^[12][0-9]{3}(\/[01][0-9])?(\/[0-3][0-9])?$/){
			if($8 ~ "Influenza A" && length($4) > 0 || $8 ~ "Influenza B" || $8 ~ "Influenza C" || $8 ~ "Influenza D") {
				for(i=1; i<=NF; i++) {
					if(length($i)==0) {
						$i = "null";
					}
				}
				split($6, a, "/");
				split($8, b, " ");
				type = b[2];
				segment = sprintf("%s (%s)", $3, label[type][$3]);
				printf("%s\t%s\tInfluenza %s\t%s\t%s\t%s\t%s\t%s\n", header[$1], anchor_taxid[type], type, segment, $4, $2, a[1], $8);
			}
		}
	}
}' "$fasta_fixed" "$metadata" > "$output"

#-------------------------------------------------
echo_log "${GREEN}Done${NC} (${YELLOW}"$(basename $0)"${NC})"
