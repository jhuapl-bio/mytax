#!/bin/bash

# Function to print usage
usage() {
    echo "Usage: $0 -m <mode> -i <input> -o <output> [additional options]"
    echo "  -m    Mode: basecaller or demux"
    echo "  -i    Input file or directory"
    echo "  -o    Output directory"
    echo "  -c    Config file (only for basecaller)"
    echo "  -p    Additional parameters"
    exit 1
}

# Initialize variables
MODE="basecaller"
INPUT=""
DEVICE="cpu"
OUTPUT=""
CONFIG="hac@v4.3.0"
KITNAME="EXP-NBD114"
PARAMS=""

# Parse command-line options
while getopts ":m:i:o:c:p:d:k:" opt; do
    case ${opt} in
        m )
            MODE=$OPTARG
            ;;
        i )
            INPUT=$OPTARG
            ;;
        o )
            OUTPUT=$OPTARG
            ;;
        k )
            KITNAME=$KITNAME
            ;;
        d )
            DEVICE=$DEVICE
            ;;
        c )
            CONFIG=$OPTARG
            ;;
        p )
            PARAMS=$OPTARG
            ;;
        \? )
            echo "Invalid option: $OPTARG" 1>&2
            usage
            ;;
        : )
            echo "Invalid option: $OPTARG requires an argument" 1>&2
            usage
            ;;
    esac
done
shift $((OPTIND -1))

# Check required arguments
if [ -z "$MODE" ] || [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
    echo "Missing required arguments"
    usage
fi

# Run the appropriate command based on the mode
case $MODE in
    basecaller)
        if [ -z "$CONFIG" ]; then
            echo "Config file is required for basecaller mode"
            usage
        fi
        echo "Running dorado basecaller with input: $INPUT, output: $OUTPUT, config: $CONFIG params: $PARAMS device: $DEVICE" 
        # if it doesnt end with .fastq.gz or .fq.gz then exit
        if [[ ! $OUTPUT =~ \.fastq.gz$ ]] && [[ ! $OUTPUT =~ \.fq.gz$ ]]; then
            echo "Input file must be a fastq.gz file"
            exit 1
        fi
        mkdir -p $(dirname $OUTPUT)
        
        dorado basecaller \
            --no-trim \
            -x $DEVICE -r \
            $CONFIG $INPUT  $PARAMS | gzip - > $OUTPUT
        ;;
    demux)
        echo "Running dorado demux with input: $INPUT, output: $OUTPUT"
        dorado demux \
            --kit-name $KITNAME --emit-fastq $PARAMS \
            --output-dir $OUTPUT $INPUT \
            --no-trim 

        ;;
    *)
        echo "Invalid mode: $MODE"
        usage
        ;;
esac
