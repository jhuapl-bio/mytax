import argparse
import pandas as pd
from anytree import Node, RenderTree
import os
import urllib.request
import re
from datetime import datetime, timedelta


format_datetime  = "%Y-%m-%dT%H:%M:%SZ"
now = datetime.utcnow().strftime(format_datetime)

#---------------------------------------------------------------------------------------------------

# author: Brian Merritt (brian.merritt@jhuapl.edu)

# This script:
#   Creates a hierarchy of taxonomy ranks and calls from a report generated by kraken2 or centrifuge or kraken 1
# It also requires a nodes.dmp file from a taxonomy pull from ncbi or custom made 

#---------------------------------------------------------------------------------------------------
# LICENSE AND DISCLAIMER
#
# Copyright (c) 2021 Brian Merritt

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




pd.set_option('display.max_columns', 500)
pd.set_option('display.width', 1000)
parser = argparse.ArgumentParser(description = "Get fasta files from uniprot batch query script tsv file. Fasta files only from EMBL")
parser.add_argument('-o', required = True, type=str,  help = 'Output file of data tsv format')
parser.add_argument('--report',  required = False,  type = str, help = 'Kraken Report File(s)')
parser.add_argument('-d', required = False,  type = str, default="\t", help = 'Delimiter for file')
parser.add_argument('-taxdump', required = False,  type = str, default=None, help = 'Specify taxdump file e.g. nodes dmp which is a mapping in col 1 of taxid and rank in col 3')
parser.add_argument('-taxmapCols', required = False,  type = int, nargs="+", default=[1,3], help = 'Specify columns to map taxid (first entry) to rank (second). Will be minimum 2 values. Default: [1,3] starting index 1')
parser.add_argument('-taxd', required = False,  type = str, default="\t\t\|", help = 'Delimiter for taxdump file, defaults to \t\t| which is frome nodes.dmp')
parser.add_argument('-download', dest="download", required = False, action='store_true', help = 'Download taxdump file for getting rank to taxid mapping (need nodes.dmp). Outputs to either -taxdump and if empty to -o')
# parser.add_argument('--out', required = False,  type = str, help = 'Kraken  Report Out File')
parser.add_argument('-additionals', required = False,  type = str, nargs="+",  default=['common name', 'synonym'], help = 'Attributes to additionally pull out per taxid. E.g. common name, authority, includes ')
parser.add_argument('-names', required = False,  type = str, default=[], help = 'Names.dmp file to get the -additionals input from')

args = parser.parse_args()
# outmap = dict()

def read_report(df_report, tax_map, names_map):
    # filehandle = open(file, 'r')
    nodes = []
    last_count = 0
    last_index = 0
    index = 0
    mappings = dict()
    unclass = False
   
    for index, line in df_report.iterrows():
        assignment = line['name'].split("  ")
        counts = assignment.count("")
        assignment_filtered = "".join([i for i in assignment if i])
        taxid = int(line['taxid'])
        fullname = '{0};{1}'.format(taxid, assignment_filtered) 
        if taxid == 0:
            unclass = True
        if taxid in tax_map:
            fullname = fullname  + "({0})".format(tax_map[taxid])
        else:
            if taxid > 1:
                fullname = fullname  + "(no rank)"
        
        if int(taxid) <= 1:
            fullname = fullname + "(no rank)"
        if counts == 0:
            root = Node(fullname)
            last_count = counts
            nodes.append(root)
            mappings[taxid] = root
        else:
            for entry in reversed(nodes):
                if counts - 1 == len(entry.ancestors):
                    index +=1
                    node = Node(fullname, parent=entry)
                    nodes.append(node)
                    mappings[taxid] = node
                    break
        
                    
    # close the pointer to that file
    # filehandle.close()
    return mappings

# def search_rows(c):
#     print(c)
#     n = mappings[c]

def get_fullstring(taxid, nodes):
    fullstring = ""
    tree = []
    for ancestor in nodes[taxid].ancestors:
        tree.append(ancestor.name)
    tree.append(nodes[taxid].name)
    fullstring = "|".join(tree)
    
    return fullstring
def get_extras(taxid, names_map):
    extra = []
    fullstring = ""
    additionals = vars(args)['additionals']
    if names_map:
        for additional in additionals:
            if additional in names_map and taxid in names_map[additional]:
                print("{}({})".format(names_map[additional][taxid], additional))
                extra.append("{}({})".format(names_map[additional][taxid], additional))
        extra = ", ".join(extra)
        fullstring = extra
    return fullstring
def download_file(url, output):
    print('Beginning file download with urllib2...', url, "to: ", output)
    urllib.request.urlretrieve(url,  output )
def map_ranks(file):
    mapping = dict()
    cols = vars(args)['taxmapCols']
    
    with open(file, 'r') as filehandle:
        for line in filehandle:
            line = line.rstrip()
            line_split = [x for x in re.split(r"[{0}]".format(vars(args)['taxd']), line) if x]
            taxid = int(line_split[cols[0]-1])
           
            rank = line_split[cols[1]-1]
            mapping[taxid] = rank
    filehandle.close()
    return mapping

def change_time(index):
    start_time = index.start_time
    null_time = index.null_time
    now_new = null_time + timedelta(milliseconds=int(start_time))
    return now_new
def main():
    # print(df_report)
    # sample_tree()
    names_map = dict()
    
    if vars(args)['download']:
        print("downloading taxdump")
        output = ""
        if vars(args)['taxdump']:
            output= os.path.dirname(vars(args)['taxdump'])
        else:
            output= os.path.dirname(vars(args)['o'])
        
        output  = os.path.join(output, "taxdump.tar.gz")
        download_file('ftp://ftp.ncbi.nlm.nih.gov/pub/taxonomy/taxdump.tar.gz', output)

        if os.name == 'nt':
            print("Windows platform detected, skipping decompressions")
        else:
            print("Running posix, decompressing")
            # importing the "tarfile" module
            import tarfile
            
            # open file
            file = tarfile.open(output)
            
            # extracting file
            file.extractall(os.path.join(os.path.dirname(output), "taxonomy" ) )

            file.close()
        print("Downloaded, exiting...")
        exit()

    # df_out = pd.read_csv(vars(args)['out'], sep="\t", names=['state', 'id', 'taxid', 'readLength', 'kmers'])
    cols_report = ["coverage", "number_covered", "number_assigned", "rank_code", "taxid", "name"]
    cols_names = ["taxid", "value", "extr", "attribute"]
    df_names = None
    if vars(args)['names'] and len(vars(args)['additionals']) >= 1:
        df_names = pd.read_csv(vars(args)['names'], sep='\t\|\t?', names=cols_names, index_col=False)
        for f in vars(args)['additionals']:
            names_map[f] = dict()
        filtered = df_names[df_names['attribute'].isin(vars(args)['additionals'])]
        for  index, row in filtered.iterrows():
            attribute = row['attribute']
            names_map[attribute][row['taxid']] = row['value']
    df_report = pd.read_csv(vars(args)['report'], sep="\t", names=cols_report)
    
    aggregation_functions = {'coverage': 'mean', 'number_covered': 'sum', 'number_assigned': 'sum',  "rank_code": "first", 'taxid': "first", "name": "first"}
    # df_report = df_report.groupby(df_report['taxid']).aggregate(aggregation_functions)
    # df_report.reset_index(drop=True, inplace=True)
    if 0 not in df_report['taxid'].values:
        print("All reads were classified, adding unclassified to fullstring output...")
        df_report = pd.DataFrame( [[0.0,0,0,"U",0,"unclassified"]], columns=cols_report ).append(df_report,  ignore_index=True)
    # tax = pd.read_csv(vars(args)['taxdump'], delimiter=r"vars(args)['taxd']", header=None)
    tax_map = dict()
    if vars(args)['taxdump']:
        tax_map = map_ranks(vars(args)['taxdump'])
    nodes = read_report(df_report, tax_map, names_map)
    # nodes = df_report.apply(read_report, args=(tax_map,))
    # outmap = df_out.set_index('id').to_dict('index') # make a dict from the out file to use the tax mapping with
    # print(outmap)
    # write_report(file=vars(args)['o'], nodes=nodes, df=df_out)
    df_report['fullstring'] = df_report['taxid'].apply(get_fullstring, args=(nodes, )   )
    df_report['extras'] = df_report['taxid'].apply(get_extras, args=(names_map, )   )
    # df_out_merged = df_out.merge(df_report, right_on="taxid", left_on="taxid")
    df_report.to_csv(vars(args)['o'], sep="\t", index=False, header=False)    # make the final fullstring file
    # bash krakenreport2json.sh -i /opt/data/${data.data.filename}.fullstring -o /opt/data/${data.data.filename}.json`


if __name__ == "__main__":
    main()    
