import argparse
import pandas as pd
from anytree import Node, RenderTree
import os
import urllib.request
import re






pd.set_option('display.max_columns', 500)
pd.set_option('display.width', 1000)
parser = argparse.ArgumentParser(description = "Get fasta files from uniprot batch query script tsv file. Fasta files only from EMBL")
parser.add_argument('-o', required = True, type=str,  help = 'Output file of data tsv format')
parser.add_argument('-i', required = True,  nargs="+", type = str, help = '2 or more fullstring files to merge into a final fullstring file, denoted by the -o argument')

outmap = dict()

def main(args):
    # print(df_report)
    # sample_tree()
    print("main")
    for file in args['i']:
        print(file)

    
if __name__ == "__main__":

    args = parser.parse_args()
    main(vars(args)) 
