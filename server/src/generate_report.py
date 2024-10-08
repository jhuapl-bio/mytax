import argparse
import pandas as pd
from anytree import Node, RenderTree
import os
import urllib.request
import re
from datetime import datetime, timedelta


format_datetime  = "%Y-%m-%dT%H:%M:%SZ"
now = datetime.utcnow().strftime(format_datetime)




pd.set_option('display.max_columns', 500)
pd.set_option('display.width', 1000)
parser = argparse.ArgumentParser(description = "Get fasta files from uniprot batch query script tsv file. Fasta files only from EMBL")
parser.add_argument('-o', required = True, type=str,  help = 'Output file of data tsv format')
parser.add_argument('-i', required = True,  type = str, help = 'Sequencing Summary File from Sequencing Run')
parser.add_argument('-out', required = True,  type = str, help = 'Kraken  Report Out File')
parser.add_argument('-report', required = True,  type = str, help = 'Kraken Report File')
parser.add_argument('-d', required = False,  type = str, default="\t", help = 'Delimiter for file')
parser.add_argument('-taxdump', required = False,  type = str, default=None, help = 'Specify taxdump file e.g. nodes dmp which is a mapping in col 1 of taxid and rank in col 3')
parser.add_argument('-taxmapCols', required = False,  type = int, nargs="+", default=[1,3], help = 'Specify columns to map taxid (first entry) to rank (second). Will be minimum 2 values. Default: [1,3] starting index 1')
parser.add_argument('-taxd', required = False,  type = str, default="\t\t\|", help = 'Delimiter for taxdump file, defaults to \t\t| which is frome nodes.dmp')
parser.add_argument('-download', dest="download", required = False, action='store_true', help = 'Download taxdump file for getting rank to taxid mapping (need nodes.dmp). Outputs to either -taxdump and if empty to -o')
parser.add_argument('-set_time', required = False, type=str,  help = 'set default time %Y-%m-%dT%H:%M:%SZ e.g. 2018-08-03T22:56:54Z. Defaults to now()')
parser.add_argument('-BC', required = False, type=str, default="BC01", help = 'Set barcode in use, default is BC01')

args = parser.parse_args()
outmap = dict()
df_sequencing= pd.read_csv(vars(args)['i'], sep=vars(args)['d'], header=0)
df_out = pd.read_csv(vars(args)['out'], sep="\t", names=['state', 'id', 'taxid', 'readLength', 'kmers'])
df_report = pd.read_csv(vars(args)['report'], sep="\t", names=["coverage", "number_covered", "number_assigned", "rank_code", "taxid", "name"])

def sample_tree():
    udo = Node("Udo")
    marc = Node("Marc", parent=udo)
    lian = Node("Lian", parent=marc)
    dan = Node("Dan", parent=udo)
    jet = Node("Jet", parent=dan)
    jan = Node("Jan", parent=dan)
    joe = Node("Joe", parent=dan)

    # for pre, fill, node in RenderTree(udo):
    #     print("%s%s" % (pre, node.name))
    # Udo
    # ├── Marc
    # │   └── Lian
    # └── Dan
    #     ├── Jet
    #     ├── Jan
    #     └── Joe

    print(dan.children)

def read_report(file, tax_map):
    filehandle = open(file, 'r')
    nodes = []
    last_count = 0
    last_index = 0
    index = 0
    mappings = dict()
    with open(file, 'r') as filehandle:
        for line in filehandle:
            line = line.rstrip()
            line_split = line.split("\t")
            assignment = line_split[5].split("  ")
            counts = assignment.count("")
            assignment_filtered = "".join([i for i in assignment if i])
            taxid = int(line_split[4])
            fullname = '{0};{1}'.format(taxid, assignment_filtered) 
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
    filehandle.close()
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

def download_file(url, output):
    print('Beginning file download with urllib2...', url, "to: ", output)
    urllib.request.urlretrieve(url,  output )
def map_ranks(file):
    mapping = dict()
    cols = vars(args)['taxmapCols']
    
    with open(file, 'r') as filehandle:
        for line in filehandle:
            line = line.rstrip()
            # line_split = line.split(vars(args)['taxd'])
            line_split = [x for x in re.split(r"[{0}]".format(vars(args)['taxd']), line) if x]
            taxid = int(line_split[cols[0]-1])
            rank = line_split[cols[1]-1]
            mapping[taxid] = rank
    filehandle.close()
    return mapping
def map_reads(read, nodes, outmap):
    state = None
    if read in outmap:
        state = outmap[read]
    
    return [read, state]
def change_time(index):
    start_time = index.start_time
    null_time = index.null_time
    now_new = null_time + timedelta(milliseconds=int(start_time))
    return now_new
def main():
    # print(df_report)
    # sample_tree()
    if vars(args)['set_time']:
        now = vars(args)['set_time']
    try:
        datetime.strptime(now, format_datetime)
    except ValueError:
        print("This is the incorrect date string format. It should be {0} e.g. 2018-08-03T22:56:54Z".format(format_datetime))
        exit()  
      
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
            file.extractall(os.path.join(os.path.dirname(output), "taxdump" ) )

            file.close()
        print("Downloaded, exiting...")

    
    # tax = pd.read_csv(vars(args)['taxdump'], delimiter=r"vars(args)['taxd']", header=None)
    tax_map = dict()
    if vars(args)['taxdump']:
        tax_map = map_ranks(vars(args)['taxdump'])
    nodes = read_report(vars(args)['report'], tax_map)
    outmap = df_out.set_index('id').to_dict('index') # make a dict from the out file to use the tax mapping with
    
    # write_report(file=vars(args)['o'], nodes=nodes, df=df_out)
    df_report['fullstring'] = df_report['taxid'].apply(get_fullstring, args=(nodes, )   )
    df_out_merged = df_out.merge(df_report, right_on="taxid", left_on="taxid")
    gg = df_sequencing['read_id'].apply(map_reads, args=(nodes, outmap))

    # df_sequencing['startTime'] = df_sequencing['start_time'].apply(change_time)
    df_sequencing['null_time'] = now
    df_sequencing['null_time'] = pd.to_datetime(
                          df_sequencing['null_time'],
                          format=format_datetime)
    
    df_sequencing['startTime'] = df_sequencing[['start_time', 'null_time']].apply(change_time, axis=1)
    df_sequencing_merged = df_sequencing.merge(df_out_merged, right_on="id", left_on="read_id")
    df_sequencing_merged['barcode'] = vars(args)['BC']
    df_sequencing_merged  = df_sequencing_merged[['id', 'startTime', 'channel', 'readLength', 'barcode', 'taxid', 'kmers', 'fullstring']]
    print(df_sequencing_merged.head(n=30).tail(n=7))
    df_sequencing_merged.to_csv(vars(args)['o'], sep="\t", index=False, header=True)    # make the final fullstring file

if __name__ == "__main__":
    main()    
