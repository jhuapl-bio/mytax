/*
 * Demo Kraken2 reports for offline / GitHub Pages (frontend-only) mode.
 *
 * These are REAL Kraken2 reports from two field sites (Site1: 4 samples,
 * Site2: 2 samples). Every sample carries full taxonomy down to species (S),
 * so the Cross-sample, Map and species views are populated in demo mode.
 *
 * Standard `kraken2 --report` output, tab-separated:
 *   percent  clade_reads  assigned_reads  rank_code  taxid  name(indented 2 spaces/level)
 *
 * Coordinates: all samples within a site share one lat/long, so the Map tab
 * renders them as a single segmented dot (one wedge per sample) that splits
 * apart / merges as you zoom. Site1 and Site2 sit close together so they
 * cluster into one numbered circle when zoomed out.
 */
const rpt_Site1_A = ` 15.14	658	658	U	0	unclassified
 84.86	3688	18	R	1	root
 84.10	3655	2	R1	131567	  cellular organisms
 75.10	3264	5	R2	2	    Bacteria
 72.69	3159	1	K	3379134	      Pseudomonadati
 72.66	3158	15	P	1224	        Pseudomonadota
 72.32	3143	7	C	1236	          Gammaproteobacteria
 45.33	1970	12	O	91347	            Enterobacterales
 45.05	1958	1700	F	543	              Enterobacteriaceae
  5.13	223	71	G	561	                Escherichia
  3.29	143	134	S	562	                  Escherichia coli
  0.12	5	5	S1	83333	                    Escherichia coli K-12
  0.05	2	2	S1	2778657	                    Escherichia coli O9:H10
  0.02	1	1	S1	1329907	                    Escherichia coli APEC IMT5155
  0.02	1	1	S1	585397	                    Escherichia coli ED1a
  0.12	5	5	S	1499973	                  Escherichia marmotae
  0.07	3	3	S	564	                  Escherichia fergusonii
  0.02	1	1	S	208962	                  Escherichia albertii
  0.37	16	2	G	620	                Shigella
  0.18	8	8	S	621	                  Shigella boydii
  0.09	4	4	S	623	                  Shigella flexneri
  0.02	1	1	S	622	                  Shigella dysenteriae
  0.02	1	1	S	624	                  Shigella sonnei
  0.09	4	0	G	547	                Enterobacter
  0.07	3	1	G1	354276	                  Enterobacter cloacae complex
  0.02	1	1	S	208224	                    Enterobacter kobei
  0.02	1	0	G2	2757714	                    unclassified Enterobacter cloacae complex
  0.02	1	1	S	2027919	                      Enterobacter cloacae complex sp.
  0.02	1	1	S	881260	                  Enterobacter bugandensis
  0.09	4	0	F1	2890311	                Klebsiella/Raoultella group
  0.09	4	0	G	570	                  Klebsiella
  0.07	3	0	G1	3390273	                    Klebsiella pneumoniae complex
  0.05	2	2	S	573	                      Klebsiella pneumoniae
  0.02	1	1	S	244366	                      Klebsiella variicola
  0.02	1	1	S	1134687	                    Klebsiella michiganensis
  0.07	3	0	G	1330547	                Kosakonia
  0.05	2	2	S	1646340	                  Kosakonia pseudosacchari
  0.02	1	1	S	208223	                  Kosakonia cowanii
  0.05	2	1	G	544	                Citrobacter
  0.02	1	1	G1	1344959	                  Citrobacter freundii complex
  0.05	2	1	G	590	                Salmonella
  0.02	1	1	S	28901	                  Salmonella enterica
  0.02	1	0	G	158851	                Trabulsiella
  0.02	1	1	S	379893	                  Trabulsiella odontotermitis
  0.02	1	1	G	447792	                Phytobacter
  0.02	1	0	G	413496	                Cronobacter
  0.02	1	1	S	1163710	                  Cronobacter condimenti
  0.02	1	0	G	2055880	                Pseudescherichia
  0.02	1	1	S	566	                  Pseudescherichia vulneris
 24.55	1067	0	O	135625	            Pasteurellales
 24.55	1067	19	F	712	              Pasteurellaceae
 24.09	1047	16	G	724	                Haemophilus
 23.68	1029	1027	S	729	                  Haemophilus parainfluenzae
  0.05	2	2	S1	862965	                    Haemophilus parainfluenzae T3T1
  0.02	1	1	S	726	                  Haemophilus haemolyticus
  0.02	1	1	S	727	                  Haemophilus influenzae
  0.02	1	0	G	416916	                Aggregatibacter
  0.02	1	0	G1	2639383	                  unclassified Aggregatibacter
  0.02	1	1	S	2866570	                    Aggregatibacter sp. Marseille-P9115
  2.28	99	0	O	72274	            Pseudomonadales
  2.28	99	0	F	135621	              Pseudomonadaceae
  2.28	99	82	G	286	                Pseudomonas
  0.39	17	1	G1	136841	                  Pseudomonas aeruginosa group
  0.37	16	16	S	287	                    Pseudomonas aeruginosa
  2.30	100	0	K	1783272	      Bacillati
  1.86	81	0	P	1239	        Bacillota
  1.86	81	0	C	91061	          Bacilli
  1.86	81	0	O	1385	            Bacillales
  1.86	81	0	F	186820	              Listeriaceae
  1.86	81	8	G	1637	                Listeria
  1.66	72	70	S	1639	                  Listeria monocytogenes
  0.02	1	1	S1	169963	                    Listeria monocytogenes EGD-e
  0.02	1	1	S1	879090	                    Listeria monocytogenes SLCC7179
  0.02	1	0	S	1640	                  Listeria seeligeri
  0.02	1	1	S1	702453	                    Listeria seeligeri FSL N1-067
  0.44	19	0	P	201174	        Actinomycetota
  0.44	19	1	C	1760	          Actinomycetes
  0.39	17	0	O	85007	            Mycobacteriales
  0.37	16	0	F	1653	              Corynebacteriaceae
  0.37	16	2	G	1716	                Corynebacterium
  0.30	13	13	G1	2624378	                  unclassified Corynebacterium
  0.02	1	1	S	1737425	                  Corynebacterium provencense
  0.02	1	0	F	1762	              Mycobacteriaceae
  0.02	1	0	G	670516	                Mycobacteroides
  0.02	1	1	S	1774	                  Mycobacteroides chelonae
  0.02	1	0	O	85006	            Micrococcales
  0.02	1	0	F	85020	              Dermabacteraceae
  0.02	1	0	G	36739	                Dermabacter
  0.02	1	1	S	36740	                  Dermabacter hominis
  8.95	389	0	R2	2759	    Eukaryota
  8.93	388	0	R3	33154	      Opisthokonta
  8.93	388	0	K	4751	        Fungi
  8.93	388	0	K1	451864	          Dikarya
  8.93	388	0	P	4890	            Ascomycota
  8.93	388	0	P1	716545	              saccharomyceta
  8.93	388	0	P2	147537	                Saccharomycotina
  8.93	388	0	C	4891	                  Saccharomycetes
  8.93	388	0	O	4892	                    Saccharomycetales
  8.93	388	0	F	4893	                      Saccharomycetaceae
  8.93	388	4	G	4930	                        Saccharomyces
  8.81	383	0	S	4932	                          Saccharomyces cerevisiae
  8.81	383	383	S1	559292	                            Saccharomyces cerevisiae S288C
  0.02	1	0	S	114524	                          Saccharomyces kudriavzevii
  0.02	1	1	S1	226230	                            Saccharomyces kudriavzevii IFO 1802
  0.02	1	0	K	33090	      Viridiplantae
  0.02	1	0	P	35493	        Streptophyta
  0.02	1	0	P1	131221	          Streptophytina
  0.02	1	0	P2	3193	            Embryophyta
  0.02	1	0	P3	58023	              Tracheophyta
  0.02	1	0	P4	78536	                Euphyllophyta
  0.02	1	0	P5	58024	                  Spermatophyta
  0.02	1	0	C	3398	                    Magnoliopsida
  0.02	1	0	C1	1437183	                      Mesangiospermae
  0.02	1	0	C2	71240	                        eudicotyledons
  0.02	1	0	C3	91827	                          Gunneridae
  0.02	1	0	C4	1437201	                            Pentapetalae
  0.02	1	0	C5	71275	                              rosids
  0.02	1	0	C6	91835	                                fabids
  0.02	1	0	O	72025	                                  Fabales
  0.02	1	0	F	3803	                                    Fabaceae
  0.02	1	0	F1	3814	                                      Papilionoideae
  0.02	1	0	F2	2231393	                                        50 kb inversion clade
  0.02	1	0	F3	2231387	                                          dalbergioids sensu lato
  0.02	1	0	F4	163725	                                            Dalbergieae
  0.02	1	0	F5	2231390	                                              Pterocarpus clade
  0.02	1	0	G	3817	                                                Arachis
  0.02	1	1	S	130453	                                                  Arachis duranensis
  0.35	15	0	R1	10239	  Viruses
  0.35	15	0	R2	2559587	    Riboviria
  0.35	15	0	K	2732396	      Orthornavirae
  0.32	14	0	P	2732408	        Pisuviricota
  0.32	14	0	C	2732506	          Pisoniviricetes
  0.32	14	0	O	76804	            Nidovirales
  0.32	14	0	O1	2499399	              Cornidovirineae
  0.32	14	0	F	11118	                Coronaviridae
  0.32	14	0	F1	2501931	                  Orthocoronavirinae
  0.32	14	0	G	694002	                    Betacoronavirus
  0.32	14	0	G1	2509511	                      Sarbecovirus
  0.32	14	0	S	694009	                        Severe acute respiratory syndrome-related coronavirus
  0.32	14	14	S1	2697049	                          Severe acute respiratory syndrome coronavirus 2
  0.02	1	0	P	2497569	        Negarnaviricota
  0.02	1	0	P1	2497570	          Haploviricotina
  0.02	1	0	C	2497574	            Monjiviricetes
  0.02	1	0	O	11157	              Mononegavirales
  0.02	1	0	F	11244	                Pneumoviridae
  0.02	1	0	G	1868215	                  Orthopneumovirus
  0.02	1	0	S	3049954	                    Orthopneumovirus hominis
  0.02	1	1	S1	11250	                      human respiratory syncytial virus`
const rpt_Site1_B = ` 16.40	848	848	U	0	unclassified
 83.60	4324	19	R	1	root
 81.75	4228	1	R1	131567	  cellular organisms
 70.28	3635	7	R2	2	    Bacteria
 69.62	3601	1	K	3379134	      Pseudomonadati
 69.61	3600	11	P	1224	        Pseudomonadota
 69.37	3588	7	C	1236	          Gammaproteobacteria
 51.43	2660	26	O	91347	            Enterobacterales
 50.93	2634	2260	F	543	              Enterobacteriaceae
  6.54	338	86	G	561	                Escherichia
  4.49	232	220	S	562	                  Escherichia coli
  0.04	2	2	S1	83333	                    Escherichia coli K-12
  0.04	2	2	S1	2848144	                    Escherichia coli O158:H23
  0.02	1	1	S1	2072463	                    Escherichia coli O78
  0.02	1	0	S1	376725	                    Escherichia coli O103:H2
  0.02	1	1	S2	585395	                      Escherichia coli O103:H2 str. 12009
  0.02	1	1	S1	585034	                    Escherichia coli IAI1
  0.02	1	1	S1	930406	                    Escherichia coli O157:H16
  0.02	1	1	S1	1055538	                    Escherichia coli O145
  0.02	1	1	S1	2773704	                    Escherichia coli O15:H12
  0.02	1	1	S1	2810405	                    Escherichia coli O89m:H10
  0.02	1	1	S1	481805	                    Escherichia coli ATCC 8739
  0.19	10	10	S	208962	                  Escherichia albertii
  0.10	5	5	S	564	                  Escherichia fergusonii
  0.08	4	4	S	1499973	                  Escherichia marmotae
  0.02	1	0	G1	2608889	                  unclassified Escherichia
  0.02	1	1	S	2044467	                    Escherichia sp. E4742
  0.21	11	0	G	620	                Shigella
  0.10	5	5	S	623	                  Shigella flexneri
  0.08	4	4	S	622	                  Shigella dysenteriae
  0.02	1	1	S	621	                  Shigella boydii
  0.02	1	1	S	624	                  Shigella sonnei
  0.17	9	3	G	544	                Citrobacter
  0.04	2	0	G1	1344959	                  Citrobacter freundii complex
  0.02	1	1	S	546	                    Citrobacter freundii
  0.02	1	1	S	67827	                    Citrobacter werkmanii
  0.04	2	0	G1	2644389	                  unclassified Citrobacter
  0.04	2	2	S	1573676	                    Citrobacter sp. R56
  0.02	1	1	S	545	                  Citrobacter koseri
  0.02	1	1	S	67824	                  Citrobacter farmeri
  0.14	7	6	G	547	                Enterobacter
  0.02	1	0	G1	2608935	                  unclassified Enterobacter
  0.02	1	1	S	2866201	                    Enterobacter sp. Colony194
  0.10	5	0	F1	2890311	                Klebsiella/Raoultella group
  0.10	5	1	G	570	                  Klebsiella
  0.04	2	1	G1	3390273	                    Klebsiella pneumoniae complex
  0.02	1	1	S	244366	                      Klebsiella variicola
  0.02	1	1	S	548	                    Klebsiella aerogenes
  0.02	1	1	S	1134687	                    Klebsiella michiganensis
  0.02	1	0	G	590	                Salmonella
  0.02	1	0	S	28901	                  Salmonella enterica
  0.02	1	0	S1	59205	                    Salmonella enterica subsp. houtenae
  0.02	1	1	S2	2729104	                      Salmonella enterica subsp. houtenae serovar 43:z4
  0.02	1	1	G	82976	                Buttiauxella
  0.02	1	0	G	83654	                Leclercia
  0.02	1	1	S	83655	                  Leclercia adecarboxylata
  0.02	1	0	G	413496	                Cronobacter
  0.02	1	1	S	28141	                  Cronobacter sakazakii
 15.91	823	0	O	135625	            Pasteurellales
 15.91	823	20	F	712	              Pasteurellaceae
 15.53	803	15	G	724	                Haemophilus
 15.24	788	788	S	729	                  Haemophilus parainfluenzae
  1.89	98	0	O	72274	            Pseudomonadales
  1.89	98	1	F	135621	              Pseudomonadaceae
  1.88	97	79	G	286	                Pseudomonas
  0.35	18	2	G1	136841	                  Pseudomonas aeruginosa group
  0.31	16	16	S	287	                    Pseudomonas aeruginosa
  0.02	1	0	C	28211	          Alphaproteobacteria
  0.02	1	0	O	356	            Hyphomicrobiales
  0.02	1	0	F	82115	              Rhizobiaceae
  0.02	1	0	F1	227290	                Rhizobium/Agrobacterium group
  0.02	1	0	G	357	                  Agrobacterium
  0.02	1	1	S	1183413	                    Agrobacterium salinitolerans
  0.52	27	0	K	1783272	      Bacillati
  0.52	27	0	P	201174	        Actinomycetota
  0.52	27	3	C	1760	          Actinomycetes
  0.43	22	0	O	85007	            Mycobacteriales
  0.43	22	0	F	1653	              Corynebacteriaceae
  0.43	22	1	G	1716	                Corynebacterium
  0.35	18	18	G1	2624378	                  unclassified Corynebacterium
  0.02	1	1	S	2055947	                  Corynebacterium heidelbergense
  0.02	1	1	S	43770	                  Corynebacterium striatum
  0.02	1	1	S	2768834	                  Corynebacterium zhongnanshanii
  0.02	1	0	O	85006	            Micrococcales
  0.02	1	0	F	85020	              Dermabacteraceae
  0.02	1	0	G	36739	                Dermabacter
  0.02	1	1	S	36740	                  Dermabacter hominis
  0.02	1	0	O	2037	            Actinomycetales
  0.02	1	0	F	2049	              Actinomycetaceae
  0.02	1	0	G	1654	                Actinomyces
  0.02	1	1	G1	2609248	                  unclassified Actinomyces
 11.45	592	0	R2	2759	    Eukaryota
 11.45	592	0	R3	33154	      Opisthokonta
 11.45	592	0	K	4751	        Fungi
 11.45	592	0	K1	451864	          Dikarya
 11.45	592	0	P	4890	            Ascomycota
 11.45	592	0	P1	716545	              saccharomyceta
 11.45	592	0	P2	147537	                Saccharomycotina
 11.45	592	0	C	4891	                  Saccharomycetes
 11.45	592	0	O	4892	                    Saccharomycetales
 11.45	592	0	F	4893	                      Saccharomycetaceae
 11.45	592	5	G	4930	                        Saccharomyces
 11.35	587	0	S	4932	                          Saccharomyces cerevisiae
 11.35	587	587	S1	559292	                            Saccharomyces cerevisiae S288C
  1.49	77	0	R1	10239	  Viruses
  1.49	77	0	R2	2559587	    Riboviria
  1.49	77	0	K	2732396	      Orthornavirae
  1.43	74	0	P	2732408	        Pisuviricota
  1.43	74	0	C	2732506	          Pisoniviricetes
  1.43	74	0	O	76804	            Nidovirales
  1.43	74	0	O1	2499399	              Cornidovirineae
  1.43	74	0	F	11118	                Coronaviridae
  1.43	74	0	F1	2501931	                  Orthocoronavirinae
  1.43	74	0	G	694002	                    Betacoronavirus
  1.43	74	0	G1	2509511	                      Sarbecovirus
  1.43	74	0	S	694009	                        Severe acute respiratory syndrome-related coronavirus
  1.43	74	74	S1	2697049	                          Severe acute respiratory syndrome coronavirus 2
  0.06	3	0	P	2497569	        Negarnaviricota
  0.06	3	0	P1	2497570	          Haploviricotina
  0.06	3	0	C	2497574	            Monjiviricetes
  0.06	3	0	O	11157	              Mononegavirales
  0.06	3	0	F	11244	                Pneumoviridae
  0.06	3	0	G	1868215	                  Orthopneumovirus
  0.06	3	0	S	3049954	                    Orthopneumovirus hominis
  0.06	3	3	S1	11250	                      human respiratory syncytial virus`
const rpt_Site1_C = ` 14.70	1657	1657	U	0	unclassified
 85.30	9617	154	R	1	root
 83.83	9451	3	R1	131567	  cellular organisms
 81.42	9179	24	R2	2	    Bacteria
 80.92	9123	3	K	3379134	      Pseudomonadati
 80.89	9120	17	P	1224	        Pseudomonadota
 80.74	9103	26	C	1236	          Gammaproteobacteria
 70.70	7971	106	O	91347	            Enterobacterales
 69.73	7861	6608	F	543	              Enterobacteriaceae
 10.12	1141	170	G	561	                Escherichia
  8.21	926	905	S	562	                  Escherichia coli
  0.04	5	5	S1	83333	                    Escherichia coli K-12
  0.04	4	4	S1	83334	                    Escherichia coli O157:H7
  0.03	3	3	S1	2778657	                    Escherichia coli O9:H10
  0.01	1	1	S1	2773706	                    Escherichia coli O68:H12
  0.01	1	1	S1	1954351	                    Escherichia coli APEC O2-211
  0.01	1	1	S1	2810404	                    Escherichia coli O7:H4
  0.01	1	1	S1	1055537	                    Escherichia coli O121
  0.01	1	0	S1	1055539	                    Escherichia coli O91
  0.01	1	1	S2	1055545	                      Escherichia coli O91 str. RM7190
  0.01	1	1	S1	2773707	                    Escherichia coli O19:H7
  0.01	1	1	S1	1329907	                    Escherichia coli APEC IMT5155
  0.01	1	0	S1	861906	                    Escherichia coli O44:H18
  0.01	1	1	S2	216592	                      Escherichia coli 042
  0.01	1	1	S1	244320	                    Escherichia coli O55:H7
  0.19	21	21	S	208962	                  Escherichia albertii
  0.10	11	11	S	564	                  Escherichia fergusonii
  0.08	9	1	G1	2608889	                  unclassified Escherichia
  0.04	5	5	S	2044467	                    Escherichia sp. E4742
  0.01	1	1	S	1849427	                    Escherichia sp. F1
  0.01	1	1	S	2509666	                    Escherichia sp. KS167_9B
  0.01	1	1	S	2725997	                    Escherichia sp. SCLE84
  0.04	4	4	S	1499973	                  Escherichia marmotae
  0.35	40	8	G	620	                Shigella
  0.12	13	13	S	622	                  Shigella dysenteriae
  0.10	11	11	S	621	                  Shigella boydii
  0.06	7	7	S	623	                  Shigella flexneri
  0.01	1	1	S	624	                  Shigella sonnei
  0.17	19	4	G	547	                Enterobacter
  0.10	11	0	G1	354276	                  Enterobacter cloacae complex
  0.04	4	3	S	158836	                    Enterobacter hormaechei
  0.01	1	1	S1	1296536	                      Enterobacter hormaechei subsp. xiangfangensis
  0.03	3	3	S	61645	                    Enterobacter asburiae
  0.02	2	1	S	550	                    Enterobacter cloacae
  0.01	1	0	S1	69219	                      Enterobacter cloacae subsp. dissolvens
  0.01	1	1	S2	1104326	                        Enterobacter cloacae subsp. dissolvens SDM
  0.02	2	2	S	1812935	                    Enterobacter roggenkampii
  0.03	3	0	G1	2608935	                  unclassified Enterobacter
  0.02	2	2	S	2742676	                    Enterobacter sp. RHBSTW-00994
  0.01	1	1	S	2724468	                    Enterobacter sp. JUb54
  0.01	1	1	S	2478464	                  Enterobacter oligotrophicus
  0.12	14	6	G	590	                Salmonella
  0.07	8	2	S	28901	                  Salmonella enterica
  0.05	6	1	S1	59201	                    Salmonella enterica subsp. enterica
  0.01	1	1	S2	53961	                      Salmonella enterica subsp. enterica serovar Abortusovis
  0.01	1	1	S2	90371	                      Salmonella enterica subsp. enterica serovar Typhimurium
  0.01	1	1	S2	600	                      Salmonella enterica subsp. enterica serovar Thompson
  0.01	1	0	S2	90370	                      Salmonella enterica subsp. enterica serovar Typhi
  0.01	1	1	S3	209261	                        Salmonella enterica subsp. enterica serovar Typhi str. Ty2
  0.01	1	1	S2	440524	                      Salmonella enterica subsp. enterica serovar 4,[5],12:i:-
  0.12	13	0	F1	2890311	                Klebsiella/Raoultella group
  0.09	10	2	G	570	                  Klebsiella
  0.04	5	0	G1	3390273	                    Klebsiella pneumoniae complex
  0.02	2	2	S	573	                      Klebsiella pneumoniae
  0.02	2	2	S	244366	                      Klebsiella variicola
  0.01	1	1	S	1463165	                      Klebsiella quasipneumoniae
  0.02	2	2	S	1134687	                    Klebsiella michiganensis
  0.01	1	0	G1	2608929	                    unclassified Klebsiella
  0.01	1	1	S	2267618	                      Klebsiella sp. P1CD1
  0.03	3	1	G	160674	                  Raoultella
  0.01	1	1	S	575	                    Raoultella planticola
  0.01	1	0	G1	2627600	                    unclassified Raoultella
  0.01	1	1	S	2923366	                      Raoultella sp. HC6
  0.11	12	6	G	544	                Citrobacter
  0.02	2	0	G1	1344959	                  Citrobacter freundii complex
  0.02	2	2	S	546	                    Citrobacter freundii
  0.01	1	0	S	35703	                  Citrobacter amalonaticus
  0.01	1	1	S1	1261127	                    Citrobacter amalonaticus Y19
  0.01	1	1	S	67824	                  Citrobacter farmeri
  0.01	1	0	G1	2644389	                  unclassified Citrobacter
  0.01	1	1	S	1573676	                    Citrobacter sp. R56
  0.01	1	1	S	2894201	                  Citrobacter meridianamericanus
  0.02	2	0	G	1330545	                Lelliottia
  0.01	1	1	S	61646	                  Lelliottia amnigena
  0.01	1	0	G1	2642424	                  unclassified Lelliottia
  0.01	1	1	S	2153385	                    Lelliottia sp. WB101
  0.02	2	0	G	82976	                Buttiauxella
  0.02	2	0	G1	2634062	                  unclassified Buttiauxella
  0.02	2	2	S	2986951	                    Buttiauxella sp. WJP83
  0.02	2	1	G	413496	                Cronobacter
  0.01	1	1	S	413502	                  Cronobacter turicensis
  0.01	1	0	G	1330547	                Kosakonia
  0.01	1	1	S	283686	                  Kosakonia radicincitans
  0.01	1	0	G	1649298	                Siccibacter
  0.01	1	1	S	1505757	                  Siccibacter colletis
  0.01	1	0	G	2055880	                Pseudescherichia
  0.01	1	1	S	566	                  Pseudescherichia vulneris
  0.01	1	0	G	409304	                Candidatus Ishikawella
  0.01	1	0	S	168169	                  Candidatus Ishikawella capsulata
  0.01	1	1	S1	476281	                    Candidatus Ishikawaella capsulata Mpkobe
  0.01	1	0	G	158851	                Trabulsiella
  0.01	1	1	S	379893	                  Trabulsiella odontotermitis
  0.01	1	0	G	158483	                Cedecea
  0.01	1	1	S	158822	                  Cedecea neteri
  0.01	1	1	G	83654	                Leclercia
  0.01	1	1	F1	36866	                unclassified Enterobacteriaceae
  0.02	2	0	F	1903411	              Yersiniaceae
  0.01	1	0	G	613	                Serratia
  0.01	1	1	S	138074	                  Serratia symbiotica
  0.01	1	0	G	629	                Yersinia
  0.01	1	1	S	630	                  Yersinia enterocolitica
  0.01	1	0	F	1903409	              Erwiniaceae
  0.01	1	0	G	53335	                Pantoea
  0.01	1	0	G1	2630326	                  unclassified Pantoea
  0.01	1	1	S	592316	                    Pantoea sp. At-9b
  0.01	1	0	F	2812006	              Bruguierivoracaceae
  0.01	1	0	G	84565	                Sodalis
  0.01	1	1	S	2697027	                  Sodalis ligni
  5.65	637	0	O	135625	            Pasteurellales
  5.65	637	7	F	712	              Pasteurellaceae
  5.58	629	10	G	724	                Haemophilus
  5.49	619	618	S	729	                  Haemophilus parainfluenzae
  0.01	1	1	S1	862965	                    Haemophilus parainfluenzae T3T1
  0.01	1	1	G	1960084	                Rodentibacter
  4.15	468	0	O	72274	            Pseudomonadales
  4.15	468	4	F	135621	              Pseudomonadaceae
  4.12	464	333	G	286	                Pseudomonas
  1.13	127	3	G1	136841	                  Pseudomonas aeruginosa group
  1.10	124	124	S	287	                    Pseudomonas aeruginosa
  0.02	2	1	G1	196821	                  unclassified Pseudomonas
  0.01	1	1	S	2126069	                    Pseudomonas sp. LBUM920
  0.01	1	1	S	2565368	                  Pseudomonas atacamensis
  0.01	1	0	G1	136849	                  Pseudomonas syringae group
  0.01	1	1	G2	251698	                    Pseudomonas syringae group genomosp. 2
  0.01	1	0	O	135623	            Vibrionales
  0.01	1	0	F	641	              Vibrionaceae
  0.01	1	0	G	662	                Vibrio
  0.01	1	1	S	666	                  Vibrio cholerae
  0.28	32	0	K	1783272	      Bacillati
  0.28	32	0	P	201174	        Actinomycetota
  0.28	32	1	C	1760	          Actinomycetes
  0.24	27	0	O	85007	            Mycobacteriales
  0.24	27	0	F	1653	              Corynebacteriaceae
  0.24	27	3	G	1716	                Corynebacterium
  0.17	19	18	G1	2624378	                  unclassified Corynebacterium
  0.01	1	1	S	3059082	                    Corynebacterium sp. P8-C1
  0.01	1	0	S	38288	                  Corynebacterium genitalium
  0.01	1	1	S1	585529	                    Corynebacterium genitalium ATCC 33030
  0.01	1	1	S	43770	                  Corynebacterium striatum
  0.01	1	0	S	42817	                  Corynebacterium argentoratense
  0.01	1	1	S1	1348662	                    Corynebacterium argentoratense DSM 44202
  0.01	1	1	S	146827	                  Corynebacterium simulans
  0.01	1	1	S	1072256	                  Corynebacterium uterequi
  0.02	2	0	O	85011	            Kitasatosporales
  0.02	2	0	F	2062	              Streptomycetaceae
  0.02	2	2	G	1883	                Streptomyces
  0.01	1	0	O	85006	            Micrococcales
  0.01	1	0	F	85023	              Microbacteriaceae
  0.01	1	0	G	33882	                Microbacterium
  0.01	1	1	S	57043	                  Microbacterium esteraromaticum
  0.01	1	0	O	85008	            Micromonosporales
  0.01	1	0	F	28056	              Micromonosporaceae
  0.01	1	0	G	1873	                Micromonospora
  0.01	1	1	G1	2617518	                  unclassified Micromonospora
  2.39	269	0	R2	2759	    Eukaryota
  2.39	269	0	R3	33154	      Opisthokonta
  2.39	269	0	K	4751	        Fungi
  2.39	269	0	K1	451864	          Dikarya
  2.39	269	0	P	4890	            Ascomycota
  2.39	269	0	P1	716545	              saccharomyceta
  2.39	269	0	P2	147537	                Saccharomycotina
  2.39	269	0	C	4891	                  Saccharomycetes
  2.39	269	0	O	4892	                    Saccharomycetales
  2.39	269	0	F	4893	                      Saccharomycetaceae
  2.39	269	3	G	4930	                        Saccharomyces
  2.36	266	0	S	4932	                          Saccharomyces cerevisiae
  2.36	266	266	S1	559292	                            Saccharomyces cerevisiae S288C
  0.11	12	0	R1	10239	  Viruses
  0.11	12	0	R2	2559587	    Riboviria
  0.11	12	0	K	2732396	      Orthornavirae
  0.11	12	0	P	2497569	        Negarnaviricota
  0.11	12	0	P1	2497570	          Haploviricotina
  0.11	12	0	C	2497574	            Monjiviricetes
  0.11	12	0	O	11157	              Mononegavirales
  0.11	12	0	F	11244	                Pneumoviridae
  0.11	12	0	G	1868215	                  Orthopneumovirus
  0.11	12	0	S	3049954	                    Orthopneumovirus hominis
  0.11	12	12	S1	11250	                      human respiratory syncytial virus`
const rpt_Site1_D = ` 14.38	2447	2447	U	0	unclassified
 85.62	14574	169	R	1	root
 84.47	14377	6	R1	131567	  cellular organisms
 81.53	13878	38	R2	2	    Bacteria
 80.68	13733	3	K	3379134	      Pseudomonadati
 80.66	13729	40	P	1224	        Pseudomonadota
 80.42	13689	51	C	1236	          Gammaproteobacteria
 70.44	11990	183	O	91347	            Enterobacterales
 69.32	11799	9871	F	543	              Enterobacteriaceae
 10.38	1766	300	G	561	                Escherichia
  8.22	1399	1373	S	562	                  Escherichia coli
  0.05	9	9	S1	83333	                    Escherichia coli K-12
  0.02	3	3	S1	2027293	                    Escherichia coli O8:H8
  0.01	2	2	S1	83334	                    Escherichia coli O157:H7
  0.01	1	1	S1	2773705	                    Escherichia coli O18ac:H14
  0.01	1	1	S1	2778657	                    Escherichia coli O9:H10
  0.01	1	1	S1	2848143	                    Escherichia coli O85:H1
  0.01	1	1	S1	2848144	                    Escherichia coli O158:H23
  0.01	1	1	S1	585034	                    Escherichia coli IAI1
  0.01	1	1	S1	585397	                    Escherichia coli ED1a
  0.01	1	1	S1	941322	                    Escherichia coli O25b:H4-ST131
  0.01	1	0	S1	685037	                    Escherichia coli O83:H1
  0.01	1	1	S2	685038	                      Escherichia coli O83:H1 str. NRG 857C
  0.01	1	1	S1	2763104	                    Escherichia coli O150:H6
  0.01	1	1	S1	316435	                    Escherichia coli Nissle 1917
  0.01	1	1	S1	1329907	                    Escherichia coli APEC IMT5155
  0.01	1	0	S1	2233553	                    Escherichia coli O43
  0.01	1	1	S2	1055541	                      Escherichia coli O43 str. RM10042
  0.13	22	22	S	208962	                  Escherichia albertii
  0.12	20	20	S	1499973	                  Escherichia marmotae
  0.09	15	15	S	564	                  Escherichia fergusonii
  0.06	10	1	G1	2608889	                  unclassified Escherichia
  0.04	6	6	S	2044467	                    Escherichia sp. E4742
  0.01	2	2	S	2509662	                    Escherichia sp. HH091_1A
  0.01	1	1	S	2725997	                    Escherichia sp. SCLE84
  0.31	53	6	G	620	                Shigella
  0.11	19	14	S	623	                  Shigella flexneri
  0.01	2	2	S1	424720	                    Shigella flexneri Y
  0.01	1	1	S1	42897	                    Shigella flexneri 2a
  0.01	1	1	S1	1282358	                    Shigella flexneri Shi06HN006
  0.01	1	1	S1	1617964	                    Shigella flexneri 4c
  0.08	13	13	S	622	                  Shigella dysenteriae
  0.06	10	10	S	621	                  Shigella boydii
  0.03	5	5	S	624	                  Shigella sonnei
  0.17	29	8	G	544	                Citrobacter
  0.07	12	1	G1	1344959	                  Citrobacter freundii complex
  0.02	4	4	S	67827	                    Citrobacter werkmanii
  0.02	3	3	S	546	                    Citrobacter freundii
  0.01	2	2	S	57706	                    Citrobacter braakii
  0.01	1	1	S	1639133	                    Citrobacter portucalensis
  0.01	1	0	G2	2816438	                    unclassified Citrobacter freundii complex
  0.01	1	1	S	2066049	                      Citrobacter freundii complex sp. CFNIH2
  0.02	4	0	G1	2644389	                  unclassified Citrobacter
  0.02	3	3	S	2742624	                    Citrobacter sp. RHB25-C09
  0.01	1	1	S	1573676	                    Citrobacter sp. R56
  0.01	1	0	S	35703	                  Citrobacter amalonaticus
  0.01	1	1	S1	1261127	                    Citrobacter amalonaticus Y19
  0.01	1	1	S	67824	                  Citrobacter farmeri
  0.01	1	1	S	67825	                  Citrobacter rodentium
  0.01	1	1	S	2546350	                  Citrobacter arsenatis
  0.01	1	1	S	2562449	                  Citrobacter tructae
  0.16	28	7	G	547	                Enterobacter
  0.10	17	2	G1	354276	                  Enterobacter cloacae complex
  0.04	7	6	S	158836	                    Enterobacter hormaechei
  0.01	1	1	S1	301105	                      Enterobacter hormaechei subsp. hormaechei
  0.02	3	3	S	61645	                    Enterobacter asburiae
  0.01	1	1	S	550	                    Enterobacter cloacae
  0.01	1	1	S	1812935	                    Enterobacter roggenkampii
  0.01	1	1	S	2494701	                    Enterobacter chengduensis
  0.01	1	1	S	2497875	                    Enterobacter chuandaensis
  0.01	1	0	G2	2757714	                    unclassified Enterobacter cloacae complex
  0.01	1	1	S	2027919	                      Enterobacter cloacae complex sp.
  0.02	4	0	G1	2608935	                  unclassified Enterobacter
  0.01	2	2	S	2724468	                    Enterobacter sp. JUb54
  0.01	1	1	S	2742676	                    Enterobacter sp. RHBSTW-00994
  0.01	1	1	S	2836161	                    Enterobacter sp. SGAir0187
  0.11	19	1	F1	2890311	                Klebsiella/Raoultella group
  0.09	16	4	G	570	                  Klebsiella
  0.07	12	2	G1	3390273	                    Klebsiella pneumoniae complex
  0.04	7	7	S	573	                      Klebsiella pneumoniae
  0.01	2	2	S	244366	                      Klebsiella variicola
  0.01	1	1	S	1463165	                      Klebsiella quasipneumoniae
  0.01	2	1	G	160674	                  Raoultella
  0.01	1	1	S	54291	                    Raoultella ornithinolytica
  0.05	9	3	G	1330547	                Kosakonia
  0.01	2	2	S	1005665	                  Kosakonia oryzendophytica
  0.01	1	1	S	208223	                  Kosakonia cowanii
  0.01	1	1	S	1646340	                  Kosakonia pseudosacchari
  0.01	1	0	G1	2632876	                  unclassified Kosakonia
  0.01	1	1	S	2067958	                    Kosakonia sp. MUSA4
  0.01	1	1	S	3139408	                  Kosakonia calanthes
  0.05	8	3	G	590	                Salmonella
  0.03	5	2	S	28901	                  Salmonella enterica
  0.01	2	0	S1	59201	                    Salmonella enterica subsp. enterica
  0.01	1	1	S2	595	                      Salmonella enterica subsp. enterica serovar Infantis
  0.01	1	1	S2	2024273	                      Salmonella enterica subsp. enterica serovar Sundsvall
  0.01	1	0	S1	59205	                    Salmonella enterica subsp. houtenae
  0.01	1	1	S2	2729104	                      Salmonella enterica subsp. houtenae serovar 43:z4
  0.02	3	0	G	1504576	                Pseudocitrobacter
  0.02	3	3	S	1398493	                  Pseudocitrobacter faecalis
  0.02	3	1	G	83654	                Leclercia
  0.01	1	1	S	83655	                  Leclercia adecarboxylata
  0.01	1	1	S	2815358	                  Leclercia pneumoniae
  0.01	2	0	G	1335483	                Shimwellia
  0.01	2	2	S	563	                  Shimwellia blattae
  0.01	2	0	G	1330545	                Lelliottia
  0.01	1	1	S	61646	                  Lelliottia amnigena
  0.01	1	1	S	69220	                  Lelliottia nimipressuralis
  0.01	2	1	G	413496	                Cronobacter
  0.01	1	1	S	413503	                  Cronobacter malonaticus
  0.01	1	0	G	451512	                Mangrovibacter
  0.01	1	1	S	1691903	                  Mangrovibacter phragmitis
  0.01	1	0	G	2815296	                Jejubacter
  0.01	1	1	S	2579935	                  Jejubacter calystegiae
  0.01	1	0	G	1649295	                Franconibacter
  0.01	1	1	S	2047724	                  Franconibacter daqui
  0.01	1	1	G	579	                Kluyvera
  0.02	3	0	F	1903411	              Yersiniaceae
  0.01	1	1	G	629	                Yersinia
  0.01	1	1	G	34037	                Rahnella
  0.01	1	0	G	929812	                Gibbsiella
  0.01	1	1	S	929813	                  Gibbsiella quercinecans
  0.01	2	0	F	1903409	              Erwiniaceae
  0.01	1	0	G	551	                Erwinia
  0.01	1	1	S	552	                  Erwinia amylovora
  0.01	1	0	G	53335	                Pantoea
  0.01	1	1	S	3098669	                  Candidatus Pantoea soli
  0.01	1	0	F	1903410	              Pectobacteriaceae
  0.01	1	0	G	204037	                Dickeya
  0.01	1	1	S	204039	                  Dickeya dianthicola
  0.01	1	0	F	1903412	              Hafniaceae
  0.01	1	0	G	635	                Edwardsiella
  0.01	1	1	S	636	                  Edwardsiella tarda
  0.01	1	0	F	1903414	              Morganellaceae
  0.01	1	0	G	637	                Arsenophonus
  0.01	1	0	G1	2627083	                  unclassified Arsenophonus
  0.01	1	1	S	235559	                    Arsenophonus endosymbiont of Aleurodicus dispersus
  5.50	936	0	O	72274	            Pseudomonadales
  5.50	936	7	F	135621	              Pseudomonadaceae
  5.46	929	667	G	286	                Pseudomonas
  1.47	251	12	G1	136841	                  Pseudomonas aeruginosa group
  1.40	239	239	S	287	                    Pseudomonas aeruginosa
  0.01	2	0	G1	196821	                  unclassified Pseudomonas
  0.01	1	1	S	3137451	                    Pseudomonas sp. G.S.17
  0.01	1	1	S	1294143	                    Pseudomonas sp. ATCC 13867
  0.01	2	0	G1	136845	                  Pseudomonas putida group
  0.01	1	1	S	47880	                    Pseudomonas fulva
  0.01	1	1	S	47885	                    Pseudomonas oryzihabitans
  0.01	2	0	G1	136843	                  Pseudomonas fluorescens group
  0.01	1	1	S	1114970	                    Pseudomonas ogarae
  0.01	1	1	S	294	                    Pseudomonas fluorescens
  0.01	1	1	S	2565368	                  Pseudomonas atacamensis
  0.01	1	1	S	556533	                  Pseudomonas benzenivorans
  0.01	1	1	S	2745512	                  Pseudomonas shahriarae
  0.01	1	1	S	1785145	                  Pseudomonas glycinae
  0.01	1	0	G1	136842	                  Pseudomonas chlororaphis group
  0.01	1	0	S	587753	                    Pseudomonas chlororaphis
  0.01	1	1	S1	1513890	                      Pseudomonas chlororaphis subsp. piscium
  4.15	707	0	O	135625	            Pasteurellales
  4.15	707	12	F	712	              Pasteurellaceae
  4.08	694	19	G	724	                Haemophilus
  3.97	675	675	S	729	                  Haemophilus parainfluenzae
  0.01	1	0	G	745	                Pasteurella
  0.01	1	1	S	753	                  Pasteurella canis
  0.01	1	0	O	1706369	            Cellvibrionales
  0.01	1	0	F	1706373	              Microbulbiferaceae
  0.01	1	0	G	48073	                Microbulbifer
  0.01	1	1	S	2944933	                  Microbulbifer spongiae
  0.01	1	0	O	135613	            Chromatiales
  0.01	1	0	F	72276	              Ectothiorhodospiraceae
  0.01	1	0	G	106633	                Thioalkalivibrio
  0.01	1	1	S	106634	                  Thioalkalivibrio versutus
  0.01	1	0	O	135614	            Lysobacterales
  0.01	1	0	F	32033	              Lysobacteraceae
  0.01	1	0	G	338	                Xanthomonas
  0.01	1	0	G1	643453	                  Xanthomonas citri group
  0.01	1	0	S	346	                    Xanthomonas citri
  0.01	1	1	S1	611301	                      Xanthomonas citri pv. citri
  0.01	1	0	O	135624	            Aeromonadales
  0.01	1	0	F	84642	              Aeromonadaceae
  0.01	1	0	G	642	                Aeromonas
  0.01	1	1	S	644	                  Aeromonas hydrophila
  0.01	1	0	O	135623	            Vibrionales
  0.01	1	0	F	641	              Vibrionaceae
  0.01	1	1	G	662	                Vibrio
  0.01	1	0	P	200940	        Thermodesulfobacteriota
  0.01	1	0	C	3031651	          Desulfuromonadia
  0.01	1	0	O	69541	            Desulfuromonadales
  0.01	1	0	F	3031665	              Geoalkalibacteraceae
  0.01	1	0	G	392332	                Geoalkalibacter
  0.01	1	1	S	483547	                  Geoalkalibacter subterraneus
  0.63	107	0	K	1783272	      Bacillati
  0.38	64	0	P	201174	        Actinomycetota
  0.38	64	4	C	1760	          Actinomycetes
  0.33	56	1	O	85007	            Mycobacteriales
  0.32	54	0	F	1653	              Corynebacteriaceae
  0.32	54	6	G	1716	                Corynebacterium
  0.25	42	40	G1	2624378	                  unclassified Corynebacterium
  0.01	1	1	S	3059082	                    Corynebacterium sp. P8-C1
  0.01	1	1	S	2989734	                    Corynebacterium sp. 21KM1197
  0.01	1	1	S	2675218	                  Corynebacterium comes
  0.01	1	0	S	349751	                  Corynebacterium marinum
  0.01	1	1	S1	1224162	                    Corynebacterium marinum DSM 44953
  0.01	1	1	S	1336740	                  Corynebacterium atrinae
  0.01	1	0	S	1121358	                  Corynebacterium doosanense
  0.01	1	1	S1	558173	                    Corynebacterium doosanense CAU 212 = DSM 45436
  0.01	1	1	S	2080740	                  Corynebacterium yudongzhengii
  0.01	1	1	S	1414719	                  Corynebacterium jeddahense
  0.01	1	0	F	85026	              Gordoniaceae
  0.01	1	0	G	2053	                Gordonia
  0.01	1	0	G1	2657482	                  unclassified Gordonia (in: high G+C Gram-positive bacteria)
  0.01	1	1	S	2935861	                    Gordonia sp. PP30
  0.01	1	0	O	85004	            Bifidobacteriales
  0.01	1	0	F	31953	              Bifidobacteriaceae
  0.01	1	0	G	1678	                Bifidobacterium
  0.01	1	0	G1	2608897	                  unclassified Bifidobacterium
  0.01	1	1	S	2983233	                    Bifidobacterium sp. ESL0790
  0.01	1	0	O	85006	            Micrococcales
  0.01	1	0	F	85017	              Promicromonosporaceae
  0.01	1	1	G	254250	                Isoptericola
  0.01	1	0	O	2037	            Actinomycetales
  0.01	1	0	F	2049	              Actinomycetaceae
  0.01	1	1	G	1654	                Actinomyces
  0.01	1	0	O	85011	            Kitasatosporales
  0.01	1	1	F	2062	              Streptomycetaceae
  0.25	43	0	P	1239	        Bacillota
  0.25	43	0	C	91061	          Bacilli
  0.25	43	0	O	1385	            Bacillales
  0.25	42	0	F	186820	              Listeriaceae
  0.25	42	2	G	1637	                Listeria
  0.24	40	38	S	1639	                  Listeria monocytogenes
  0.01	2	2	S1	169963	                    Listeria monocytogenes EGD-e
  0.01	1	0	F	186822	              Paenibacillaceae
  0.01	1	1	G	55080	                Brevibacillus
  2.90	493	0	R2	2759	    Eukaryota
  2.89	492	0	R3	33154	      Opisthokonta
  2.88	491	0	K	4751	        Fungi
  2.88	491	0	K1	451864	          Dikarya
  2.88	491	0	P	4890	            Ascomycota
  2.88	491	0	P1	716545	              saccharomyceta
  2.88	491	0	P2	147537	                Saccharomycotina
  2.88	491	0	C	4891	                  Saccharomycetes
  2.88	491	0	O	4892	                    Saccharomycetales
  2.88	491	0	F	4893	                      Saccharomycetaceae
  2.88	491	1	G	4930	                        Saccharomyces
  2.88	490	0	S	4932	                          Saccharomyces cerevisiae
  2.88	490	490	S1	559292	                            Saccharomyces cerevisiae S288C
  0.01	1	0	K	33208	        Metazoa
  0.01	1	0	K1	6072	          Eumetazoa
  0.01	1	0	K2	33213	            Bilateria
  0.01	1	0	K3	33511	              Deuterostomia
  0.01	1	0	P	7711	                Chordata
  0.01	1	0	P1	89593	                  Craniata
  0.01	1	0	P2	7742	                    Vertebrata
  0.01	1	0	P3	7776	                      Gnathostomata
  0.01	1	0	P4	117570	                        Teleostomi
  0.01	1	0	P5	117571	                          Euteleostomi
  0.01	1	0	P6	8287	                            Sarcopterygii
  0.01	1	0	P7	1338369	                              Dipnotetrapodomorpha
  0.01	1	0	P8	32523	                                Tetrapoda
  0.01	1	0	P9	32524	                                  Amniota
  0.01	1	0	C	40674	                                    Mammalia
  0.01	1	0	C1	32525	                                      Theria
  0.01	1	0	C2	9347	                                        Eutheria
  0.01	1	0	C3	1437010	                                          Boreoeutheria
  0.01	1	0	C4	314146	                                            Euarchontoglires
  0.01	1	0	O	9443	                                              Primates
  0.01	1	0	O1	376913	                                                Haplorrhini
  0.01	1	0	O2	314293	                                                  Simiiformes
  0.01	1	0	O3	9526	                                                    Catarrhini
  0.01	1	0	O4	314295	                                                      Hominoidea
  0.01	1	0	F	9604	                                                        Hominidae
  0.01	1	0	F1	207598	                                                          Homininae
  0.01	1	0	G	9605	                                                            Homo
  0.01	1	1	S	9606	                                                              Homo sapiens
  0.01	1	0	K	33090	      Viridiplantae
  0.01	1	0	P	35493	        Streptophyta
  0.01	1	0	P1	131221	          Streptophytina
  0.01	1	0	P2	3193	            Embryophyta
  0.01	1	0	P3	58023	              Tracheophyta
  0.01	1	0	P4	78536	                Euphyllophyta
  0.01	1	0	P5	58024	                  Spermatophyta
  0.01	1	0	C	3398	                    Magnoliopsida
  0.01	1	0	C1	1437183	                      Mesangiospermae
  0.01	1	0	C2	71240	                        eudicotyledons
  0.01	1	0	C3	91827	                          Gunneridae
  0.01	1	0	C4	1437201	                            Pentapetalae
  0.01	1	0	C5	71275	                              rosids
  0.01	1	0	C6	91835	                                fabids
  0.01	1	0	O	72025	                                  Fabales
  0.01	1	0	F	3803	                                    Fabaceae
  0.01	1	0	F1	3814	                                      Papilionoideae
  0.01	1	0	F2	2231393	                                        50 kb inversion clade
  0.01	1	0	F3	2231382	                                          NPAAA clade
  0.01	1	0	F4	2233838	                                            Hologalegina
  0.01	1	0	F5	2233839	                                              IRL clade
  0.01	1	0	F6	163742	                                                Trifolieae
  0.01	1	0	G	3898	                                                  Trifolium
  0.01	1	1	S	57577	                                                    Trifolium pratense
  0.16	28	0	R1	10239	  Viruses
  0.16	28	0	R2	2559587	    Riboviria
  0.16	28	0	K	2732396	      Orthornavirae
  0.16	28	0	P	2497569	        Negarnaviricota
  0.16	28	0	P1	2497570	          Haploviricotina
  0.16	28	0	C	2497574	            Monjiviricetes
  0.16	28	0	O	11157	              Mononegavirales
  0.16	28	0	F	11244	                Pneumoviridae
  0.16	28	0	G	1868215	                  Orthopneumovirus
  0.16	28	0	S	3049954	                    Orthopneumovirus hominis
  0.16	28	28	S1	11250	                      human respiratory syncytial virus`
const rpt_Site2_A = ` 12.38	1665	1665	U	0	unclassified
 87.62	11788	72	R	1	root
 87.09	11716	1	R1	131567	  cellular organisms
 84.70	11395	14	R2	2	    Bacteria
 83.88	11284	2	K	3379134	      Pseudomonadati
 83.85	11281	125	P	1224	        Pseudomonadota
 82.88	11150	72	C	1236	          Gammaproteobacteria
 56.57	7610	0	O	72274	            Pseudomonadales
 56.57	7610	79	F	135621	              Pseudomonadaceae
 55.95	7527	5480	G	286	                Pseudomonas
 14.97	2014	77	G1	136841	                  Pseudomonas aeruginosa group
 14.36	1932	1927	S	287	                    Pseudomonas aeruginosa
  0.01	2	2	S1	1352354	                      Pseudomonas aeruginosa PAO581
  0.01	1	0	S1	208964	                      Pseudomonas aeruginosa PAO1
  0.01	1	1	S2	1147787	                        Pseudomonas aeruginosa PAO1H2O
  0.01	1	1	S1	798130	                      Pseudomonas aeruginosa 39016
  0.01	1	1	S1	1089456	                      Pseudomonas aeruginosa NCGM2.S1
  0.03	4	1	S	2994495	                    Pseudomonas paraeruginosa
  0.02	3	3	S1	381754	                      Pseudomonas paraeruginosa PA7
  0.01	1	1	S	53408	                    Pseudomonas citronellolis
  0.16	22	4	G1	196821	                  unclassified Pseudomonas
  0.02	3	3	S	2866282	                    Pseudomonas sp. PS1(2021)
  0.01	1	1	S	2487887	                    Pseudomonas sp. KU43P
  0.01	1	1	S	2944234	                    Pseudomonas sp. LRP2-20
  0.01	1	1	S	3110111	                    Pseudomonas sp. JQ170C
  0.01	1	1	S	2705472	                    Pseudomonas sp. MTM4
  0.01	1	1	S	3242491	                    Pseudomonas sp. QE6
  0.01	1	1	S	3096605	                    Pseudomonas sp. AN-1
  0.01	1	1	S	2706126	                    Pseudomonas sp. OIL-1
  0.01	1	1	S	2954086	                    Pseudomonas sp. FP2196
  0.01	1	1	S	1294143	                    Pseudomonas sp. ATCC 13867
  0.01	1	1	S	2991051	                    Pseudomonas sp. KU26590
  0.01	1	1	S	517398	                    Pseudomonas sp. D3
  0.01	1	1	S	1357074	                    Pseudomonas sp. LS44
  0.01	1	1	S	2738126	                    Pseudomonas sp. FP215
  0.01	1	1	S	3399679	                    Pseudomonas sp. OHS18
  0.01	1	1	S	2545800	                    Pseudomonas sp. FDAARGOS_761
  0.01	2	0	G1	136845	                  Pseudomonas putida group
  0.01	1	1	S	303	                    Pseudomonas putida
  0.01	1	1	S	47885	                    Pseudomonas oryzihabitans
  0.01	2	2	S	157783	                  Pseudomonas cremoricolorata
  0.01	1	1	S	2931382	                  Pseudomonas abieticivorans
  0.01	1	1	G1	136849	                  Pseudomonas syringae group
  0.01	1	0	G1	136843	                  Pseudomonas fluorescens group
  0.01	1	1	S	200450	                    Pseudomonas trivialis
  0.01	1	0	G1	136842	                  Pseudomonas chlororaphis group
  0.01	1	1	S	587753	                    Pseudomonas chlororaphis
  0.01	1	1	S	122355	                  Pseudomonas psychrophila
  0.01	1	0	G1	62104	                  environmental samples
  0.01	1	1	S	114707	                    uncultured Pseudomonas sp.
  0.01	1	1	S	321661	                  Pseudomonas vranovensis
  0.01	2	1	G	2901164	                Stutzerimonas
  0.01	1	1	S	3022791	                  Stutzerimonas decontaminans
  0.01	1	0	G	2901189	                Halopseudomonas
  0.01	1	1	S	2918528	                  Halopseudomonas maritima
  0.01	1	0	G	3236652	                Aquipseudomonas
  0.01	1	1	S	2731681	                  Aquipseudomonas campi
 17.95	2415	32	O	91347	            Enterobacterales
 17.71	2382	2074	F	543	              Enterobacteriaceae
  2.04	275	81	G	561	                Escherichia
  1.39	187	176	S	562	                  Escherichia coli
  0.04	6	6	S1	83333	                    Escherichia coli K-12
  0.01	1	1	S1	83334	                    Escherichia coli O157:H7
  0.01	1	1	S1	409438	                    Escherichia coli SE11
  0.01	1	1	S1	2773704	                    Escherichia coli O15:H12
  0.01	1	1	S1	941322	                    Escherichia coli O25b:H4-ST131
  0.01	1	1	S1	2773707	                    Escherichia coli O19:H7
  0.02	3	3	S	1499973	                  Escherichia marmotae
  0.01	2	0	G1	2608889	                  unclassified Escherichia
  0.01	2	2	S	2044467	                    Escherichia sp. E4742
  0.01	1	1	S	564	                  Escherichia fergusonii
  0.01	1	1	S	208962	                  Escherichia albertii
  0.07	9	1	G	620	                Shigella
  0.04	5	4	S	623	                  Shigella flexneri
  0.01	1	1	S1	1617964	                    Shigella flexneri 4c
  0.01	2	2	S	621	                  Shigella boydii
  0.01	1	1	S	624	                  Shigella sonnei
  0.05	7	0	F1	2890311	                Klebsiella/Raoultella group
  0.04	6	0	G	570	                  Klebsiella
  0.04	5	0	G1	3390273	                    Klebsiella pneumoniae complex
  0.02	3	3	S	573	                      Klebsiella pneumoniae
  0.01	1	0	S	244366	                      Klebsiella variicola
  0.01	1	1	S1	2590157	                        Klebsiella variicola subsp. variicola
  0.01	1	1	S	1463165	                      Klebsiella quasipneumoniae
  0.01	1	1	S	548	                    Klebsiella aerogenes
  0.01	1	0	G	160674	                  Raoultella
  0.01	1	1	S	575	                    Raoultella planticola
  0.04	6	3	G	544	                Citrobacter
  0.01	2	0	G1	1344959	                  Citrobacter freundii complex
  0.01	1	1	S	546	                    Citrobacter freundii
  0.01	1	1	S	1639133	                    Citrobacter portucalensis
  0.01	1	0	G1	2644389	                  unclassified Citrobacter
  0.01	1	1	S	2742624	                    Citrobacter sp. RHB25-C09
  0.02	3	2	G	547	                Enterobacter
  0.01	1	1	S	881260	                  Enterobacter bugandensis
  0.01	1	0	G	1330545	                Lelliottia
  0.01	1	1	S	61646	                  Lelliottia amnigena
  0.01	1	0	G	1335483	                Shimwellia
  0.01	1	1	S	563	                  Shimwellia blattae
  0.01	1	0	G	1903434	                Atlantibacter
  0.01	1	1	S	565	                  Atlantibacter hermannii
  0.01	1	0	G	158876	                Yokenella
  0.01	1	1	S	158877	                  Yokenella regensburgei
  0.01	1	0	G	158851	                Trabulsiella
  0.01	1	1	S	379893	                  Trabulsiella odontotermitis
  0.01	1	0	G	158483	                Cedecea
  0.01	1	1	S	158823	                  Cedecea lapagei
  0.01	1	0	G	2815296	                Jejubacter
  0.01	1	1	S	2579935	                  Jejubacter calystegiae
  0.01	1	1	G	579	                Kluyvera
  0.01	1	0	F	1903411	              Yersiniaceae
  0.01	1	1	G	613	                Serratia
  7.80	1050	0	O	135625	            Pasteurellales
  7.80	1050	18	F	712	              Pasteurellaceae
  7.66	1030	20	G	724	                Haemophilus
  7.51	1010	1009	S	729	                  Haemophilus parainfluenzae
  0.01	1	1	S1	862965	                    Haemophilus parainfluenzae T3T1
  0.01	1	0	G	416916	                Aggregatibacter
  0.01	1	1	S	732	                  Aggregatibacter aphrophilus
  0.01	1	0	G	713	                Actinobacillus
  0.01	1	1	S	51161	                  Actinobacillus delphinicola
  0.01	1	0	O	72273	            Thiotrichales
  0.01	1	0	F	135616	              Piscirickettsiaceae
  0.01	1	0	G	2039723	                Thiomicrorhabdus
  0.01	1	1	S	2580412	                  Thiomicrorhabdus sediminis
  0.01	1	0	O	135623	            Vibrionales
  0.01	1	0	F	641	              Vibrionaceae
  0.01	1	0	G	657	                Photobacterium
  0.01	1	1	S	38293	                  Photobacterium damselae
  0.01	1	0	O	135614	            Lysobacterales
  0.01	1	0	F	32033	              Lysobacteraceae
  0.01	1	0	G	40323	                Stenotrophomonas
  0.01	1	0	G1	196198	                  unclassified Stenotrophomonas
  0.01	1	1	S	3027225	                    Stenotrophomonas sp. BIO128-Bstrain
  0.02	3	0	C	28216	          Betaproteobacteria
  0.01	2	0	O	80840	            Burkholderiales
  0.01	1	0	F	80864	              Comamonadaceae
  0.01	1	0	G	12916	                Acidovorax
  0.01	1	1	S	758826	                  Acidovorax radicis
  0.01	1	0	F	2975441	              Sphaerotilaceae
  0.01	1	0	G	196013	                Caldimonas
  0.01	1	1	S	215580	                  Caldimonas thermodepolymerans
  0.01	1	0	O	206351	            Neisseriales
  0.01	1	0	F	481	              Neisseriaceae
  0.01	1	0	G	482	                Neisseria
  0.01	1	1	S	495	                  Neisseria elongata
  0.01	2	0	C	28211	          Alphaproteobacteria
  0.01	1	0	O	204457	            Sphingomonadales
  0.01	1	0	F	41297	              Sphingomonadaceae
  0.01	1	0	G	165695	                Sphingobium
  0.01	1	0	G1	2611147	                  unclassified Sphingobium
  0.01	1	1	S	2970925	                    Sphingobium sp. JS3065
  0.01	1	0	O	204458	            Caulobacterales
  0.01	1	0	F	76892	              Caulobacteraceae
  0.01	1	0	G	20	                Phenylobacterium
  0.01	1	1	S	2201350	                  Phenylobacterium parvum
  0.01	1	0	C	1807140	          Acidithiobacillia
  0.01	1	0	O	225057	            Acidithiobacillales
  0.01	1	0	F	225059	              Thermithiobacillaceae
  0.01	1	0	G	119979	                Thermithiobacillus
  0.01	1	0	S	929	                  Thermithiobacillus tepidarius
  0.01	1	1	S1	1123368	                    Thermithiobacillus tepidarius DSM 3134
  0.01	1	0	P	203691	        Spirochaetota
  0.01	1	0	C	203692	          Spirochaetia
  0.01	1	0	O	136	            Spirochaetales
  0.01	1	0	F	2845253	              Treponemataceae
  0.01	1	0	G	157	                Treponema
  0.01	1	1	S	158	                  Treponema denticola
  0.72	97	0	K	1783272	      Bacillati
  0.64	86	0	P	1239	        Bacillota
  0.64	86	0	C	91061	          Bacilli
  0.64	86	0	O	1385	            Bacillales
  0.64	86	0	F	186820	              Listeriaceae
  0.64	86	8	G	1637	                Listeria
  0.57	77	74	S	1639	                  Listeria monocytogenes
  0.02	3	3	S1	169963	                    Listeria monocytogenes EGD-e
  0.01	1	1	S	1642	                  Listeria innocua
  0.08	11	0	P	201174	        Actinomycetota
  0.08	11	0	C	1760	          Actinomycetes
  0.07	9	0	O	85007	            Mycobacteriales
  0.07	9	0	F	1653	              Corynebacteriaceae
  0.07	9	1	G	1716	                Corynebacterium
  0.05	7	7	G1	2624378	                  unclassified Corynebacterium
  0.01	1	1	S	108486	                  Corynebacterium falsenii
  0.01	1	0	O	85008	            Micromonosporales
  0.01	1	0	F	28056	              Micromonosporaceae
  0.01	1	1	G	1873	                Micromonospora
  0.01	1	0	O	85011	            Kitasatosporales
  0.01	1	0	F	2062	              Streptomycetaceae
  0.01	1	0	G	1883	                Streptomyces
  0.01	1	1	G1	2593676	                  unclassified Streptomyces
  2.38	320	0	R2	2759	    Eukaryota
  2.38	320	0	R3	33154	      Opisthokonta
  2.38	320	0	K	4751	        Fungi
  2.38	320	0	K1	451864	          Dikarya
  2.38	320	0	P	4890	            Ascomycota
  2.38	320	0	P1	716545	              saccharomyceta
  2.38	320	0	P2	147537	                Saccharomycotina
  2.38	320	0	C	4891	                  Saccharomycetes
  2.38	320	0	O	4892	                    Saccharomycetales
  2.38	320	0	F	4893	                      Saccharomycetaceae
  2.38	320	2	G	4930	                        Saccharomyces
  2.36	318	0	S	4932	                          Saccharomyces cerevisiae
  2.36	318	318	S1	559292	                            Saccharomyces cerevisiae S288C`
const rpt_Site2_B = ` 15.91	833	833	U	0	unclassified
 84.09	4402	16	R	1	root
 83.44	4368	1	R1	131567	  cellular organisms
 64.41	3372	5	R2	2	    Bacteria
 62.54	3274	0	K	3379134	      Pseudomonadati
 62.54	3274	9	P	1224	        Pseudomonadota
 62.37	3265	6	C	1236	          Gammaproteobacteria
 36.52	1912	7	O	91347	            Enterobacterales
 36.37	1904	1655	F	543	              Enterobacteriaceae
  4.22	221	68	G	561	                Escherichia
  2.75	144	135	S	562	                  Escherichia coli
  0.10	5	3	S1	83333	                    Escherichia coli K-12
  0.02	1	1	S2	316407	                      Escherichia coli str. K-12 substr. W3110
  0.02	1	1	S2	1403831	                      Escherichia coli str. K-12 substr. MC4100
  0.02	1	1	S1	1005487	                    Escherichia coli PA2
  0.02	1	1	S1	2778657	                    Escherichia coli O9:H10
  0.02	1	1	S1	585057	                    Escherichia coli IAI39
  0.02	1	1	S1	585397	                    Escherichia coli ED1a
  0.08	4	4	S	208962	                  Escherichia albertii
  0.04	2	2	S	564	                  Escherichia fergusonii
  0.04	2	0	G1	2608889	                  unclassified Escherichia
  0.02	1	1	S	1849427	                    Escherichia sp. F1
  0.02	1	1	S	2044467	                    Escherichia sp. E4742
  0.02	1	1	S	1499973	                  Escherichia marmotae
  0.17	9	3	G	620	                Shigella
  0.08	4	4	S	623	                  Shigella flexneri
  0.02	1	1	S	622	                  Shigella dysenteriae
  0.02	1	1	S	624	                  Shigella sonnei
  0.11	6	0	G	547	                Enterobacter
  0.06	3	0	G1	354276	                  Enterobacter cloacae complex
  0.04	2	2	S	158836	                    Enterobacter hormaechei
  0.02	1	1	S	2071710	                    Enterobacter sichuanensis
  0.04	2	0	G1	2608935	                  unclassified Enterobacter
  0.02	1	1	S	3116481	                    Enterobacter sp. ECC-249
  0.02	1	1	S	3116480	                    Enterobacter sp. ECC-219
  0.02	1	1	S	2478464	                  Enterobacter oligotrophicus
  0.08	4	2	G	544	                Citrobacter
  0.04	2	0	G1	1344959	                  Citrobacter freundii complex
  0.02	1	1	S	546	                    Citrobacter freundii
  0.02	1	1	S	67827	                    Citrobacter werkmanii
  0.08	4	0	F1	2890311	                Klebsiella/Raoultella group
  0.08	4	0	G	570	                  Klebsiella
  0.04	2	2	G1	2608929	                    unclassified Klebsiella
  0.02	1	1	S	571	                    Klebsiella oxytoca
  0.02	1	0	G1	3390273	                    Klebsiella pneumoniae complex
  0.02	1	1	S	573	                      Klebsiella pneumoniae
  0.04	2	1	G	590	                Salmonella
  0.02	1	0	S	28901	                  Salmonella enterica
  0.02	1	0	S1	59201	                    Salmonella enterica subsp. enterica
  0.02	1	1	S2	2021403	                      Salmonella enterica subsp. enterica serovar Adjame
  0.02	1	1	G	83654	                Leclercia
  0.02	1	0	G	1330546	                Pluralibacter
  0.02	1	1	S	61647	                  Pluralibacter gergoviae
  0.02	1	0	F1	191675	                Enterobacteriaceae incertae sedis
  0.02	1	0	F2	84563	                  ant, tsetse, mealybug, aphid, etc. endosymbionts
  0.02	1	0	F3	146507	                    aphid secondary symbionts
  0.02	1	0	G	568987	                      Candidatus Hamiltonella
  0.02	1	0	S	138072	                        Candidatus Hamiltonella defensa
  0.02	1	1	S1	672795	                          Candidatus Hamiltonella defensa (Bemisia tabaci)
  0.02	1	0	F	1903409	              Erwiniaceae
  0.02	1	0	G	2100764	                Mixta
  0.02	1	1	S	1615494	                  Mixta intestinalis
 20.19	1057	0	O	135625	            Pasteurellales
 20.19	1057	11	F	712	              Pasteurellaceae
 19.96	1045	23	G	724	                Haemophilus
 19.52	1022	1022	S	729	                  Haemophilus parainfluenzae
  0.02	1	0	G	1960084	                Rodentibacter
  0.02	1	1	S	1796644	                  Rodentibacter caecimuris
  5.52	289	0	O	72274	            Pseudomonadales
  5.52	289	2	F	135621	              Pseudomonadaceae
  5.48	287	207	G	286	                Pseudomonas
  1.51	79	4	G1	136841	                  Pseudomonas aeruginosa group
  1.43	75	75	S	287	                    Pseudomonas aeruginosa
  0.02	1	0	G1	196821	                  unclassified Pseudomonas
  0.02	1	1	S	2487887	                    Pseudomonas sp. KU43P
  0.02	1	0	O	135624	            Aeromonadales
  0.02	1	0	F	84642	              Aeromonadaceae
  0.02	1	0	G	642	                Aeromonas
  0.02	1	1	S	654	                  Aeromonas veronii
  1.78	93	1	K	1783272	      Bacillati
  1.53	80	0	P	1239	        Bacillota
  1.53	80	0	C	91061	          Bacilli
  1.53	80	0	O	1385	            Bacillales
  1.53	80	0	F	186820	              Listeriaceae
  1.53	80	12	G	1637	                Listeria
  1.28	67	67	S	1639	                  Listeria monocytogenes
  0.02	1	1	S	1643	                  Listeria welshimeri
  0.23	12	0	P	201174	        Actinomycetota
  0.23	12	1	C	1760	          Actinomycetes
  0.21	11	1	O	85007	            Mycobacteriales
  0.19	10	0	F	1653	              Corynebacteriaceae
  0.19	10	2	G	1716	                Corynebacterium
  0.13	7	7	G1	2624378	                  unclassified Corynebacterium
  0.02	1	0	S	1231000	                  Corynebacterium lactis
  0.02	1	1	S1	1408189	                    Corynebacterium lactis RW2-5
 19.01	995	1	R2	2759	    Eukaryota
 18.99	994	0	R3	33154	      Opisthokonta
 18.99	994	0	K	4751	        Fungi
 18.99	994	0	K1	451864	          Dikarya
 18.99	994	0	P	4890	            Ascomycota
 18.99	994	0	P1	716545	              saccharomyceta
 18.99	994	0	P2	147537	                Saccharomycotina
 18.99	994	0	C	4891	                  Saccharomycetes
 18.99	994	0	O	4892	                    Saccharomycetales
 18.99	994	0	F	4893	                      Saccharomycetaceae
 18.99	994	8	G	4930	                        Saccharomyces
 18.82	985	0	S	4932	                          Saccharomyces cerevisiae
 18.82	985	985	S1	559292	                            Saccharomyces cerevisiae S288C
  0.02	1	0	S	114524	                          Saccharomyces kudriavzevii
  0.02	1	1	S1	226230	                            Saccharomyces kudriavzevii IFO 1802
  0.34	18	0	R1	10239	  Viruses
  0.34	18	0	R2	2559587	    Riboviria
  0.34	18	0	K	2732396	      Orthornavirae
  0.29	15	0	P	2732406	        Kitrinoviricota
  0.29	15	0	C	2732461	          Alsuviricetes
  0.29	15	0	O	2732544	            Martellivirales
  0.29	15	0	F	11018	              Togaviridae
  0.29	15	0	G	11019	                Alphavirus
  0.29	15	15	S	59301	                  Mayaro virus
  0.06	3	0	P	2732408	        Pisuviricota
  0.06	3	0	C	2732506	          Pisoniviricetes
  0.06	3	0	O	76804	            Nidovirales
  0.06	3	0	O1	2499399	              Cornidovirineae
  0.06	3	0	F	11118	                Coronaviridae
  0.06	3	0	F1	2501931	                  Orthocoronavirinae
  0.06	3	0	G	694002	                    Betacoronavirus
  0.06	3	0	G1	2509511	                      Sarbecovirus
  0.06	3	0	S	694009	                        Severe acute respiratory syndrome-related coronavirus
  0.06	3	3	S1	2697049	                          Severe acute respiratory syndrome coronavirus 2`

const demoSamples = [
  // Jacksonville, FL — two on-land sites in the city core, ~800 m apart so they
  // cluster when zoomed out and split into a 4-wedge / 2-wedge dot when zoomed in.
  // Site1: downtown (north bank of the St. Johns). Site2: Springfield, just north.
  { sample: 'Site1_A', report: rpt_Site1_A, lat: 30.3280, lon: -81.6620 },
  { sample: 'Site1_B', report: rpt_Site1_B, lat: 30.3280, lon: -81.6620 },
  { sample: 'Site1_C', report: rpt_Site1_C, lat: 30.3280, lon: -81.6620 },
  { sample: 'Site1_D', report: rpt_Site1_D, lat: 30.3280, lon: -81.6620 },
  { sample: 'Site2_A', report: rpt_Site2_A, lat: 30.3352, lon: -81.6585 },
  { sample: 'Site2_B', report: rpt_Site2_B, lat: 30.3352, lon: -81.6585 },
]

export default demoSamples
