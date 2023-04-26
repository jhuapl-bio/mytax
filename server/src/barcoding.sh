
mkdir -p /Users/merribb1/Documents/Projects/custom_influenza/2023_02_23_Influenza_Run_03_Laptop/Tiny/staged/FAV95188_pass_7b115a98_1
ln -sf /Users/merribb1/Documents/Projects/custom_influenza/2023_02_23_Influenza_Run_03_Laptop/Tiny/FAV95188_pass_7b115a98_1.fastq.gz /Users/merribb1/Documents/Projects/custom_influenza/2023_02_23_Influenza_Run_03_Laptop/Tiny/staged/FAV95188_pass_7b115a98_1/FAV95188_pass_7b115a98_1.fastq.gz;
guppy_barcoder  --compress_fastq --disable_pings -i "/Users/merribb1/Documents/Projects/custom_influenza/2023_02_23_Influenza_Run_03_Laptop/Tiny/staged/FAV95188_pass_7b115a98_1"  -s "/Users/merribb1/Documents/Projects/custom_influenza/2023_02_23_Influenza_Run_03_Laptop/Tiny/staged/FAV95188_pass_7b115a98_1/demultiplexed" --barcode_kits CUSTOM-FLU ; 
