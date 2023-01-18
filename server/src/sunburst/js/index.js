/* to do */
/*
	Breadcrumbs at top during mouseover
	More info in mouseover
	Handle categorical and continuous variables dynamically

    additional thoughts:
        D3 watching directory for new file creation
        connected to sqlite3 database?
        read in entire dataset up front and simulate time in javascript?
*/

// Completed to do:
//	File upload - done
//	Color by parameter - done
//	Legend - done
//	Make shortcut buttons work - done

/* code sources: */
//	https://bl.ocks.org/mbostock/4348373 /* original code */
//	https://bl.ocks.org/vasturiano/12da9071095fbd4df434e60d52d2d58d /* labels */
//	https://bl.ocks.org/kerryrodden/766f8f6d31f645c39f488a0befa1e3c8 /* breadcrumbs */

//	https://bl.ocks.org/kerryrodden/477c1bfb081b783f80ad /* worth checking out sometime, but not necessarily relevant for classification data */

var inferno = ['#000004','#010005','#010106','#010108','#02010a','#02020c','#02020e','#030210','#040312','#040314','#050417','#060419','#07051b','#08051d','#09061f','#0a0722','#0b0724','#0c0826','#0d0829','#0e092b','#10092d','#110a30','#120a32','#140b34','#150b37','#160b39','#180c3c','#190c3e','#1b0c41','#1c0c43','#1e0c45','#1f0c48','#210c4a','#230c4c','#240c4f','#260c51','#280b53','#290b55','#2b0b57','#2d0b59','#2f0a5b','#310a5c','#320a5e','#340a5f','#360961','#380962','#390963','#3b0964','#3d0965','#3e0966','#400a67','#420a68','#440a68','#450a69','#470b6a','#490b6a','#4a0c6b','#4c0c6b','#4d0d6c','#4f0d6c','#510e6c','#520e6d','#540f6d','#550f6d','#57106e','#59106e','#5a116e','#5c126e','#5d126e','#5f136e','#61136e','#62146e','#64156e','#65156e','#67166e','#69166e','#6a176e','#6c186e','#6d186e','#6f196e','#71196e','#721a6e','#741a6e','#751b6e','#771c6d','#781c6d','#7a1d6d','#7c1d6d','#7d1e6d','#7f1e6c','#801f6c','#82206c','#84206b','#85216b','#87216b','#88226a','#8a226a','#8c2369','#8d2369','#8f2469','#902568','#922568','#932667','#952667','#972766','#982766','#9a2865','#9b2964','#9d2964','#9f2a63','#a02a63','#a22b62','#a32c61','#a52c60','#a62d60','#a82e5f','#a92e5e','#ab2f5e','#ad305d','#ae305c','#b0315b','#b1325a','#b3325a','#b43359','#b63458','#b73557','#b93556','#ba3655','#bc3754','#bd3853','#bf3952','#c03a51','#c13a50','#c33b4f','#c43c4e','#c63d4d','#c73e4c','#c83f4b','#ca404a','#cb4149','#cc4248','#ce4347','#cf4446','#d04545','#d24644','#d34743','#d44842','#d54a41','#d74b3f','#d84c3e','#d94d3d','#da4e3c','#db503b','#dd513a','#de5238','#df5337','#e05536','#e15635','#e25734','#e35933','#e45a31','#e55c30','#e65d2f','#e75e2e','#e8602d','#e9612b','#ea632a','#eb6429','#eb6628','#ec6726','#ed6925','#ee6a24','#ef6c23','#ef6e21','#f06f20','#f1711f','#f1731d','#f2741c','#f3761b','#f37819','#f47918','#f57b17','#f57d15','#f67e14','#f68013','#f78212','#f78410','#f8850f','#f8870e','#f8890c','#f98b0b','#f98c0a','#f98e09','#fa9008','#fa9207','#fa9407','#fb9606','#fb9706','#fb9906','#fb9b06','#fb9d07','#fc9f07','#fca108','#fca309','#fca50a','#fca60c','#fca80d','#fcaa0f','#fcac11','#fcae12','#fcb014','#fcb216','#fcb418','#fbb61a','#fbb81d','#fbba1f','#fbbc21','#fbbe23','#fac026','#fac228','#fac42a','#fac62d','#f9c72f','#f9c932','#f9cb35','#f8cd37','#f8cf3a','#f7d13d','#f7d340','#f6d543','#f6d746','#f5d949','#f5db4c','#f4dd4f','#f4df53','#f4e156','#f3e35a','#f3e55d','#f2e661','#f2e865','#f2ea69','#f1ec6d','#f1ed71','#f1ef75','#f1f179','#f2f27d','#f2f482','#f3f586','#f3f68a','#f4f88e','#f5f992','#f6fa96','#f8fb9a','#f9fc9d','#fafda1','#fcffa4'];
var magma = ['#000004','#010005','#010106','#010108','#020109','#02020b','#02020d','#03030f','#030312','#040414','#050416','#060518','#06051a','#07061c','#08071e','#090720','#0a0822','#0b0924','#0c0926','#0d0a29','#0e0b2b','#100b2d','#110c2f','#120d31','#130d34','#140e36','#150e38','#160f3b','#180f3d','#19103f','#1a1042','#1c1044','#1d1147','#1e1149','#20114b','#21114e','#221150','#241253','#251255','#271258','#29115a','#2a115c','#2c115f','#2d1161','#2f1163','#311165','#331067','#341069','#36106b','#38106c','#390f6e','#3b0f70','#3d0f71','#3f0f72','#400f74','#420f75','#440f76','#451077','#471078','#491078','#4a1079','#4c117a','#4e117b','#4f127b','#51127c','#52137c','#54137d','#56147d','#57157e','#59157e','#5a167e','#5c167f','#5d177f','#5f187f','#601880','#621980','#641a80','#651a80','#671b80','#681c81','#6a1c81','#6b1d81','#6d1d81','#6e1e81','#701f81','#721f81','#732081','#752181','#762181','#782281','#792282','#7b2382','#7c2382','#7e2482','#802582','#812581','#832681','#842681','#862781','#882781','#892881','#8b2981','#8c2981','#8e2a81','#902a81','#912b81','#932b80','#942c80','#962c80','#982d80','#992d80','#9b2e7f','#9c2e7f','#9e2f7f','#a02f7f','#a1307e','#a3307e','#a5317e','#a6317d','#a8327d','#aa337d','#ab337c','#ad347c','#ae347b','#b0357b','#b2357b','#b3367a','#b5367a','#b73779','#b83779','#ba3878','#bc3978','#bd3977','#bf3a77','#c03a76','#c23b75','#c43c75','#c53c74','#c73d73','#c83e73','#ca3e72','#cc3f71','#cd4071','#cf4070','#d0416f','#d2426f','#d3436e','#d5446d','#d6456c','#d8456c','#d9466b','#db476a','#dc4869','#de4968','#df4a68','#e04c67','#e24d66','#e34e65','#e44f64','#e55064','#e75263','#e85362','#e95462','#ea5661','#eb5760','#ec5860','#ed5a5f','#ee5b5e','#ef5d5e','#f05f5e','#f1605d','#f2625d','#f2645c','#f3655c','#f4675c','#f4695c','#f56b5c','#f66c5c','#f66e5c','#f7705c','#f7725c','#f8745c','#f8765c','#f9785d','#f9795d','#f97b5d','#fa7d5e','#fa7f5e','#fa815f','#fb835f','#fb8560','#fb8761','#fc8961','#fc8a62','#fc8c63','#fc8e64','#fc9065','#fd9266','#fd9467','#fd9668','#fd9869','#fd9a6a','#fd9b6b','#fe9d6c','#fe9f6d','#fea16e','#fea36f','#fea571','#fea772','#fea973','#feaa74','#feac76','#feae77','#feb078','#feb27a','#feb47b','#feb67c','#feb77e','#feb97f','#febb81','#febd82','#febf84','#fec185','#fec287','#fec488','#fec68a','#fec88c','#feca8d','#fecc8f','#fecd90','#fecf92','#fed194','#fed395','#fed597','#fed799','#fed89a','#fdda9c','#fddc9e','#fddea0','#fde0a1','#fde2a3','#fde3a5','#fde5a7','#fde7a9','#fde9aa','#fdebac','#fcecae','#fceeb0','#fcf0b2','#fcf2b4','#fcf4b6','#fcf6b8','#fcf7b9','#fcf9bb','#fcfbbd','#fcfdbf'];
var plasma = ['#0d0887','#100788','#130789','#16078a','#19068c','#1b068d','#1d068e','#20068f','#220690','#240691','#260591','#280592','#2a0593','#2c0594','#2e0595','#2f0596','#310597','#330597','#350498','#370499','#38049a','#3a049a','#3c049b','#3e049c','#3f049c','#41049d','#43039e','#44039e','#46039f','#48039f','#4903a0','#4b03a1','#4c02a1','#4e02a2','#5002a2','#5102a3','#5302a3','#5502a4','#5601a4','#5801a4','#5901a5','#5b01a5','#5c01a6','#5e01a6','#6001a6','#6100a7','#6300a7','#6400a7','#6600a7','#6700a8','#6900a8','#6a00a8','#6c00a8','#6e00a8','#6f00a8','#7100a8','#7201a8','#7401a8','#7501a8','#7701a8','#7801a8','#7a02a8','#7b02a8','#7d03a8','#7e03a8','#8004a8','#8104a7','#8305a7','#8405a7','#8606a6','#8707a6','#8808a6','#8a09a5','#8b0aa5','#8d0ba5','#8e0ca4','#8f0da4','#910ea3','#920fa3','#9410a2','#9511a1','#9613a1','#9814a0','#99159f','#9a169f','#9c179e','#9d189d','#9e199d','#a01a9c','#a11b9b','#a21d9a','#a31e9a','#a51f99','#a62098','#a72197','#a82296','#aa2395','#ab2494','#ac2694','#ad2793','#ae2892','#b02991','#b12a90','#b22b8f','#b32c8e','#b42e8d','#b52f8c','#b6308b','#b7318a','#b83289','#ba3388','#bb3488','#bc3587','#bd3786','#be3885','#bf3984','#c03a83','#c13b82','#c23c81','#c33d80','#c43e7f','#c5407e','#c6417d','#c7427c','#c8437b','#c9447a','#ca457a','#cb4679','#cc4778','#cc4977','#cd4a76','#ce4b75','#cf4c74','#d04d73','#d14e72','#d24f71','#d35171','#d45270','#d5536f','#d5546e','#d6556d','#d7566c','#d8576b','#d9586a','#da5a6a','#da5b69','#db5c68','#dc5d67','#dd5e66','#de5f65','#de6164','#df6263','#e06363','#e16462','#e26561','#e26660','#e3685f','#e4695e','#e56a5d','#e56b5d','#e66c5c','#e76e5b','#e76f5a','#e87059','#e97158','#e97257','#ea7457','#eb7556','#eb7655','#ec7754','#ed7953','#ed7a52','#ee7b51','#ef7c51','#ef7e50','#f07f4f','#f0804e','#f1814d','#f1834c','#f2844b','#f3854b','#f3874a','#f48849','#f48948','#f58b47','#f58c46','#f68d45','#f68f44','#f79044','#f79143','#f79342','#f89441','#f89540','#f9973f','#f9983e','#f99a3e','#fa9b3d','#fa9c3c','#fa9e3b','#fb9f3a','#fba139','#fba238','#fca338','#fca537','#fca636','#fca835','#fca934','#fdab33','#fdac33','#fdae32','#fdaf31','#fdb130','#fdb22f','#fdb42f','#fdb52e','#feb72d','#feb82c','#feba2c','#febb2b','#febd2a','#febe2a','#fec029','#fdc229','#fdc328','#fdc527','#fdc627','#fdc827','#fdca26','#fdcb26','#fccd25','#fcce25','#fcd025','#fcd225','#fbd324','#fbd524','#fbd724','#fad824','#fada24','#f9dc24','#f9dd25','#f8df25','#f8e125','#f7e225','#f7e425','#f6e626','#f6e826','#f5e926','#f5eb27','#f4ed27','#f3ee27','#f3f027','#f2f227','#f1f426','#f1f525','#f0f724','#f0f921'];
var viridis = ['#440154','#440256','#450457','#450559','#46075a','#46085c','#460a5d','#460b5e','#470d60','#470e61','#471063','#471164','#471365','#481467','#481668','#481769','#48186a','#481a6c','#481b6d','#481c6e','#481d6f','#481f70','#482071','#482173','#482374','#482475','#482576','#482677','#482878','#482979','#472a7a','#472c7a','#472d7b','#472e7c','#472f7d','#46307e','#46327e','#46337f','#463480','#453581','#453781','#453882','#443983','#443a83','#443b84','#433d84','#433e85','#423f85','#424086','#424186','#414287','#414487','#404588','#404688','#3f4788','#3f4889','#3e4989','#3e4a89','#3e4c8a','#3d4d8a','#3d4e8a','#3c4f8a','#3c508b','#3b518b','#3b528b','#3a538b','#3a548c','#39558c','#39568c','#38588c','#38598c','#375a8c','#375b8d','#365c8d','#365d8d','#355e8d','#355f8d','#34608d','#34618d','#33628d','#33638d','#32648e','#32658e','#31668e','#31678e','#31688e','#30698e','#306a8e','#2f6b8e','#2f6c8e','#2e6d8e','#2e6e8e','#2e6f8e','#2d708e','#2d718e','#2c718e','#2c728e','#2c738e','#2b748e','#2b758e','#2a768e','#2a778e','#2a788e','#29798e','#297a8e','#297b8e','#287c8e','#287d8e','#277e8e','#277f8e','#27808e','#26818e','#26828e','#26828e','#25838e','#25848e','#25858e','#24868e','#24878e','#23888e','#23898e','#238a8d','#228b8d','#228c8d','#228d8d','#218e8d','#218f8d','#21908d','#21918c','#20928c','#20928c','#20938c','#1f948c','#1f958b','#1f968b','#1f978b','#1f988b','#1f998a','#1f9a8a','#1e9b8a','#1e9c89','#1e9d89','#1f9e89','#1f9f88','#1fa088','#1fa188','#1fa187','#1fa287','#20a386','#20a486','#21a585','#21a685','#22a785','#22a884','#23a983','#24aa83','#25ab82','#25ac82','#26ad81','#27ad81','#28ae80','#29af7f','#2ab07f','#2cb17e','#2db27d','#2eb37c','#2fb47c','#31b57b','#32b67a','#34b679','#35b779','#37b878','#38b977','#3aba76','#3bbb75','#3dbc74','#3fbc73','#40bd72','#42be71','#44bf70','#46c06f','#48c16e','#4ac16d','#4cc26c','#4ec36b','#50c46a','#52c569','#54c568','#56c667','#58c765','#5ac864','#5cc863','#5ec962','#60ca60','#63cb5f','#65cb5e','#67cc5c','#69cd5b','#6ccd5a','#6ece58','#70cf57','#73d056','#75d054','#77d153','#7ad151','#7cd250','#7fd34e','#81d34d','#84d44b','#86d549','#89d548','#8bd646','#8ed645','#90d743','#93d741','#95d840','#98d83e','#9bd93c','#9dd93b','#a0da39','#a2da37','#a5db36','#a8db34','#aadc32','#addc30','#b0dd2f','#b2dd2d','#b5de2b','#b8de29','#bade28','#bddf26','#c0df25','#c2df23','#c5e021','#c8e020','#cae11f','#cde11d','#d0e11c','#d2e21b','#d5e21a','#d8e219','#dae319','#dde318','#dfe318','#e2e418','#e5e419','#e7e419','#eae51a','#ece51b','#efe51c','#f1e51d','#f4e61e','#f6e620','#f8e621','#fbe723','#fde725'];
var cubehelix = [];
var brown = ['#FFFFE4','#FFFFE3','#FFFEE3','#FFFEE2','#FFFEE1','#FFFEE0','#FFFEDF','#FFFDDE','#FFFDDD','#FFFDDC','#FFFDDB','#FFFCDA','#FFFCD9','#FFFCD8','#FFFCD7','#FFFBD6','#FFFBD4','#FFFBD3','#FFFAD2','#FFFAD1','#FFFAD0','#FFF9CF','#FFF9CD','#FFF9CC','#FFF8CB','#FFF8C9','#FFF8C8','#FFF7C7','#FFF7C5','#FFF6C4','#FFF6C3','#FFF6C1','#FFF5C0','#FFF5BE','#FFF4BD','#FFF4BB','#FFF3BA','#FFF3B8','#FFF2B7','#FFF2B5','#FFF1B4','#FFF1B2','#FFF0B1','#FFF0AF','#FFEFAD','#FFEFAC','#FFEEAA','#FFEDA8','#FFEDA7','#FFECA5','#FFECA3','#FFEBA2','#FFEAA0','#FFEA9E','#FFE99D','#FFE89B','#FFE899','#FFE797','#FFE696','#FFE594','#FFE592','#FFE490','#FFE38E','#FFE28D','#FFE28B','#FFE189','#FFE087','#FFDF86','#FFDE84','#FFDD82','#FFDD80','#FFDC7E','#FFDB7D','#FFDA7B','#FFD979','#FFD877','#FFD775','#FFD674','#FFD572','#FFD470','#FFD36E','#FFD26C','#FFD16B','#FFD069','#FFCF67','#FFCE65','#FFCD64','#FFCC62','#FFCB60','#FFCA5F','#FFC95D','#FFC85B','#FFC75A','#FEC558','#FEC456','#FEC355','#FEC253','#FEC151','#FEC050','#FEBE4E','#FEBD4D','#FEBC4B','#FEBB4A','#FEBA48','#FEB847','#FEB745','#FEB644','#FEB542','#FEB341','#FEB240','#FDB13E','#FDAF3D','#FDAE3B','#FDAD3A','#FDAC39','#FDAA37','#FDA936','#FDA835','#FDA634','#FCA532','#FCA431','#FCA230','#FCA12F','#FCA02E','#FC9E2D','#FB9D2C','#FB9C2A','#FB9A29','#FB9928','#FB9727','#FA9626','#FA9525','#FA9324','#FA9223','#F99122','#F98F22','#F98E21','#F88C20','#F88B1F','#F88A1E','#F7881D','#F7871D','#F7861C','#F6841B','#F6831A','#F5821A','#F58019','#F57F18','#F47E17','#F47C17','#F37B16','#F37A16','#F27815','#F17714','#F17614','#F07413','#F07313','#EF7212','#EE7012','#EE6F11','#ED6E11','#EC6D10','#EC6B10','#EB6A0F','#EA690F','#E9680E','#E8660E','#E8650E','#E7640D','#E6630D','#E5610C','#E4600C','#E35F0C','#E25E0B','#E15D0B','#E05C0B','#DF5B0B','#DE590A','#DD580A','#DC570A','#DA5609','#D95509','#D85409','#D75309','#D65209','#D45108','#D35008','#D24F08','#D14E08','#CF4D08','#CE4C07','#CC4B07','#CB4A07','#CA4907','#C84807','#C74707','#C54606','#C44506','#C24406','#C14306','#BF4306','#BE4206','#BC4106','#BA4006','#B93F06','#B73E05','#B63E05','#B43D05','#B23C05','#B13B05','#AF3B05','#AD3A05','#AC3905','#AA3805','#A83805','#A63705','#A53605','#A33605','#A13505','#A03404','#9E3404','#9C3304','#9A3304','#993204','#973104','#953104','#933004','#923004','#902F04','#8E2F04','#8D2E04','#8B2E04','#892D04','#872D04','#862C04','#842C04','#822B04','#812B04','#7F2A04','#7E2A04','#7C2A04','#7A2904','#792904','#772804','#762804','#742804','#732704','#712704','#702704','#6E2604','#6D2604','#6B2604','#6A2504','#692504','#672504','#662504'];
var brown2 = ['#FFF0AF','#FFEFAD','#FFEFAC','#FFEEAA','#FFEDA8','#FFEDA7','#FFECA5','#FFECA3','#FFEBA2','#FFEAA0','#FFEA9E','#FFE99D','#FFE89B','#FFE899','#FFE797','#FFE696','#FFE594','#FFE592','#FFE490','#FFE38E','#FFE28D','#FFE28B','#FFE189','#FFE087','#FFDF86','#FFDE84','#FFDD82','#FFDD80','#FFDC7E','#FFDB7D','#FFDA7B','#FFD979','#FFD877','#FFD775','#FFD674','#FFD572','#FFD470','#FFD36E','#FFD26C','#FFD16B','#FFD069','#FFCF67','#FFCE65','#FFCD64','#FFCC62','#FFCB60','#FFCA5F','#FFC95D','#FFC85B','#FFC75A','#FEC558','#FEC456','#FEC355','#FEC253','#FEC151','#FEC050','#FEBE4E','#FEBD4D','#FEBC4B','#FEBB4A','#FEBA48','#FEB847','#FEB745','#FEB644','#FEB542','#FEB341','#FEB240','#FDB13E','#FDAF3D','#FDAE3B','#FDAD3A','#FDAC39','#FDAA37','#FDA936','#FDA835','#FDA634','#FCA532','#FCA431','#FCA230','#FCA12F','#FCA02E','#FC9E2D','#FB9D2C','#FB9C2A','#FB9A29','#FB9928','#FB9727','#FA9626','#FA9525','#FA9324','#FA9223','#F99122','#F98F22','#F98E21','#F88C20','#F88B1F','#F88A1E','#F7881D','#F7871D','#F7861C','#F6841B','#F6831A','#F5821A','#F58019','#F57F18','#F47E17','#F47C17','#F37B16','#F37A16','#F27815','#F17714','#F17614','#F07413','#F07313','#EF7212','#EE7012','#EE6F11','#ED6E11','#EC6D10','#EC6B10','#EB6A0F','#EA690F','#E9680E','#E8660E','#E8650E','#E7640D','#E6630D','#E5610C','#E4600C','#E35F0C','#E25E0B','#E15D0B','#E05C0B','#DF5B0B','#DE590A','#DD580A','#DC570A','#DA5609','#D95509','#D85409','#D75309','#D65209','#D45108','#D35008','#D24F08','#D14E08','#CF4D08','#CE4C07','#CC4B07','#CB4A07','#CA4907','#C84807','#C74707','#C54606','#C44506','#C24406','#C14306','#BF4306','#BE4206','#BC4106','#BA4006','#B93F06','#B73E05','#B63E05','#B43D05','#B23C05','#B13B05','#AF3B05','#AD3A05','#AC3905','#AA3805','#A83805','#A63705','#A53605','#A33605','#A13505','#A03404','#9E3404','#9C3304','#9A3304','#993204','#973104','#953104','#933004','#923004','#902F04','#8E2F04','#8D2E04','#8B2E04','#892D04','#872D04','#862C04','#842C04','#822B04','#812B04','#7F2A04','#7E2A04','#7C2A04','#7A2904','#792904','#772804','#762804','#742804','#732704','#712704','#702704','#6E2604','#6D2604','#6B2604','#6A2504','#692504','#672504','#662504'];
var green = [];
var blue = [];
var purple = [];
var blue_red = ['#3C53A1','#3A55A3','#3957A5','#3759A6','#365BA8','#345DA9','#335FAB','#3261AD','#3263AE','#3165B0','#3167B1','#3069B3','#306BB4','#306DB6','#316FB7','#3171B9','#3273BA','#3275BC','#3377BD','#3479BE','#357BC0','#367DC1','#377FC3','#3881C4','#3983C5','#3B85C7','#3C88C8','#3E8AC9','#408CCB','#418ECC','#4390CD','#4592CF','#4794D0','#4996D1','#4B97D3','#4D99D4','#509BD5','#529DD6','#549FD7','#57A1D9','#59A3DA','#5BA5DB','#5EA7DC','#60A9DD','#63ABDE','#65ADE0','#68AEE1','#6AB0E2','#6DB2E3','#70B4E4','#72B6E5','#75B8E6','#77B9E7','#7ABBE8','#7DBDE9','#7FBFEA','#82C0EB','#85C2EC','#87C4ED','#8AC5EE','#8DC7EF','#8FC8EF','#92CAF0','#94CCF1','#97CDF2','#9ACFF3','#9CD0F3','#9FD2F4','#A1D3F5','#A4D5F5','#A6D6F6','#A9D7F7','#ABD9F7','#ADDAF8','#B0DCF8','#B2DDF9','#B4DEF9','#B7DFFA','#B9E1FA','#BBE2FB','#BDE3FB','#C0E4FB','#C2E5FB','#C4E6FC','#C6E7FC','#C8E8FC','#CAE9FC','#CCEAFC','#CEEBFC','#D0ECFC','#D2EDFC','#D3EEFC','#D5EFFC','#D7F0FC','#D9F0FB','#DAF1FB','#DCF2FB','#DDF3FA','#DFF3FA','#E0F4F9','#E2F4F9','#E3F5F8','#E5F6F8','#E6F6F7','#E7F7F6','#E9F7F6','#EAF7F5','#EBF8F4','#ECF8F3','#EDF8F2','#EEF9F1','#EFF9F0','#F0F9EF','#F1F9EE','#F2F9ED','#F3F9EB','#F4FAEA','#F5FAE9','#F5FAE7','#F6FAE6','#F7F9E5','#F8F9E3','#F8F9E2','#F9F9E0','#F9F9DE','#FAF9DD','#FAF8DB','#FBF8DA','#FBF8D8','#FCF7D6','#FCF7D4','#FCF6D3','#FDF6D1','#FDF5CF','#FDF5CD','#FDF4CB','#FEF4CA','#FEF3C8','#FEF2C6','#FEF2C4','#FEF1C2','#FEF0C0','#FEEFBE','#FEEEBC','#FEEEBA','#FEEDB8','#FEECB6','#FEEBB4','#FEEAB2','#FEE9B0','#FEE8AE','#FEE7AD','#FDE5AB','#FDE4A9','#FDE3A7','#FDE2A5','#FDE1A3','#FCDFA1','#FCDE9F','#FCDD9D','#FCDB9B','#FBDA9A','#FBD898','#FBD796','#FAD594','#FAD492','#FAD290','#F9D18F','#F9CF8D','#F8CD8B','#F8CC89','#F8CA88','#F7C886','#F7C784','#F6C583','#F6C381','#F6C180','#F5C07E','#F5BE7C','#F4BC7B','#F4BA79','#F3B878','#F3B676','#F2B475','#F2B274','#F1B072','#F1AE71','#F0AC6F','#F0AA6E','#F0A86D','#EFA66B','#EFA46A','#EEA269','#EEA068','#ED9D66','#EC9B65','#EC9964','#EB9763','#EB9562','#EA9260','#EA905F','#E98E5E','#E98C5D','#E88A5C','#E8875B','#E7855A','#E78359','#E68058','#E57E57','#E57C56','#E47A55','#E47754','#E37553','#E27353','#E27052','#E16E51','#E06C50','#DF6A4F','#DF674E','#DE654E','#DD634D','#DC604C','#DC5E4B','#DB5C4B','#DA5A4A','#D95749','#D85549','#D75348','#D65147','#D54E47','#D44C46','#D34A46','#D24845','#D14644','#D04444','#CF4143','#CD3F43','#CC3D42','#CB3B42','#C93941','#C83741','#C63540','#C53340','#C3313F','#C12F3F','#C02D3F','#BE2B3E','#BC293E','#BA283D','#B8263D','#B6243D','#B4223C','#B1213C','#AF1F3C','#AD1D3B','#AA1C3B'];
var green_red = [];
var rainbow1 = ['#781C81','#741B81','#701A80','#6C197F','#69187F','#65187F','#62187E','#60187E','#5D187E','#5B187E','#59197E','#56197F','#551A7F','#531B7F','#511C80','#501D80','#4E1E81','#4D1F82','#4C2182','#4A2283','#492384','#482585','#472786','#472887','#462A88','#452C89','#442E8A','#44308B','#43328D','#42348E','#42368F','#423891','#413A92','#413C94','#403E95','#404096','#404298','#40449A','#3F479B','#3F499D','#3F4B9E','#3F4DA0','#3F4FA2','#3F52A3','#3F54A5','#3F56A7','#3F58A8','#3F5AAA','#3F5DAC','#3F5FAD','#3F61AF','#4063B0','#4065B2','#4067B3','#4069B5','#406BB6','#416DB7','#416FB9','#4171BA','#4273BB','#4275BC','#4277BD','#4379BE','#437BBF','#447DC0','#447EC0','#4580C1','#4582C1','#4684C2','#4685C2','#4787C2','#4789C2','#488AC2','#498CC2','#498DC1','#4A8FC1','#4A90C1','#4B92C0','#4C93BF','#4D94BF','#4D96BE','#4E97BD','#4F98BC','#509ABA','#509BB9','#519CB8','#529DB7','#539EB5','#549FB4','#55A1B2','#56A2B0','#57A3AF','#58A4AD','#59A5AB','#5AA6A9','#5BA7A8','#5CA7A6','#5DA8A4','#5EA9A2','#5FAAA0','#60AB9E','#61AC9C','#62AC9A','#63AD98','#64AE96','#65AF94','#67AF92','#68B090','#69B18E','#6AB18D','#6CB28B','#6DB389','#6EB387','#6FB485','#71B483','#72B581','#73B580','#75B67E','#76B67C','#77B77B','#79B779','#7AB877','#7CB876','#7DB874','#7EB972','#80B971','#81BA6F','#83BA6E','#84BA6D','#86BB6B','#87BB6A','#89BB68','#8ABB67','#8CBC66','#8DBC64','#8FBC63','#90BC62','#92BD61','#93BD60','#95BD5F','#96BD5D','#98BD5C','#99BD5B','#9BBE5A','#9DBE59','#9EBE58','#A0BE57','#A1BE56','#A3BE55','#A4BE54','#A6BE53','#A8BE53','#A9BE52','#ABBE51','#ACBE50','#AEBE4F','#AFBE4F','#B1BE4E','#B2BE4D','#B4BD4C','#B5BD4C','#B7BD4B','#B8BD4A','#BABD4A','#BBBC49','#BDBC48','#BEBC48','#BFBB47','#C1BB46','#C2BB46','#C3BA45','#C5BA45','#C6B944','#C7B944','#C9B843','#CAB843','#CBB742','#CCB742','#CEB641','#CFB541','#D0B540','#D1B440','#D2B33F','#D3B33F','#D4B23E','#D5B13E','#D6B03D','#D7AF3D','#D8AE3D','#D9AD3C','#DAAC3C','#DBAB3B','#DCAA3B','#DDA93B','#DDA83A','#DEA63A','#DFA539','#DFA439','#E0A239','#E1A138','#E1A038','#E29E38','#E29D37','#E39B37','#E39A36','#E49836','#E49636','#E59535','#E59335','#E59135','#E68F34','#E68D34','#E68B33','#E68933','#E78733','#E78532','#E78332','#E78131','#E77F31','#E77D31','#E77B30','#E77830','#E7762F','#E7742F','#E7712F','#E76F2E','#E66C2E','#E66A2D','#E6672D','#E6652C','#E6622C','#E5602C','#E55D2B','#E55B2B','#E4582A','#E4552A','#E45329','#E35029','#E34D28','#E24B28','#E24827','#E14527','#E14226','#E04026','#E03D25','#DF3A25','#DF3824','#DE3524','#DD3223','#DD3023','#DC2D22','#DC2B22','#DB2821','#DA2621','#DA2320','#D92120'];
var rainbow2 = ['#447CBF','#447DC0','#447FC0','#4580C1','#4581C1','#4583C1','#4684C2','#4685C2','#4786C2','#4788C2','#4789C2','#488AC2','#488BC2','#498CC2','#498EC1','#4A8FC1','#4A90C1','#4B91C0','#4B92C0','#4C93BF','#4C94BF','#4D95BE','#4E96BD','#4E97BD','#4F98BC','#4F99BB','#509ABA','#509BB9','#519CB8','#529DB7','#529DB6','#539EB5','#549FB4','#54A0B3','#55A1B2','#56A2B0','#56A2AF','#57A3AE','#58A4AC','#59A5AB','#59A5AA','#5AA6A8','#5BA7A7','#5CA7A6','#5CA8A4','#5DA9A3','#5EA9A1','#5FAAA0','#60AB9E','#60AB9D','#61AC9C','#62AC9A','#63AD99','#64AE97','#65AE96','#65AF94','#66AF93','#67B091','#68B090','#69B18E','#6AB18D','#6BB28C','#6CB28A','#6DB389','#6EB387','#6FB386','#70B485','#71B483','#72B582','#73B581','#74B57F','#75B67E','#76B67D','#77B67B','#78B77A','#79B779','#7AB878','#7BB876','#7CB875','#7DB874','#7EB973','#7FB972','#80B971','#81BA6F','#82BA6E','#83BA6D','#85BA6C','#86BB6B','#87BB6A','#88BB69','#89BB68','#8ABB67','#8BBC66','#8CBC65','#8EBC64','#8FBC63','#90BC62','#91BD61','#92BD61','#93BD60','#94BD5F','#96BD5E','#97BD5D','#98BD5C','#99BD5B','#9ABE5B','#9BBE5A','#9DBE59','#9EBE58','#9FBE58','#A0BE57','#A1BE56','#A2BE56','#A4BE55','#A5BE54','#A6BE53','#A7BE53','#A8BE52','#A9BE52','#ABBE51','#ACBE50','#ADBE50','#AEBE4F','#AFBE4F','#B0BE4E','#B1BE4D','#B3BD4D','#B4BD4C','#B5BD4C','#B6BD4B','#B7BD4B','#B8BD4A','#B9BD4A','#BABC49','#BBBC49','#BDBC48','#BEBC48','#BFBC47','#C0BB47','#C1BB46','#C2BB46','#C3BB46','#C4BA45','#C5BA45','#C6BA44','#C7B944','#C8B944','#C9B843','#CAB843','#CBB842','#CCB742','#CCB742','#CDB641','#CEB641','#CFB541','#D0B540','#D1B440','#D2B43F','#D2B33F','#D3B33F','#D4B23E','#D5B13E','#D6B13E','#D6B03D','#D7AF3D','#D8AF3D','#D8AE3D','#D9AD3C','#DAAC3C','#DBAC3C','#DBAB3B','#DCAA3B','#DCA93B','#DDA83A','#DEA73A','#DEA63A','#DFA53A','#DFA439','#E0A439','#E0A239','#E1A138','#E1A038','#E29F38','#E29E38','#E29D37','#E39C37','#E39B37','#E39A36','#E49836','#E49736','#E49636','#E59535','#E59335','#E59235','#E59134','#E68F34','#E68E34','#E68C34','#E68B33','#E68933','#E78833','#E78632','#E78532','#E78332','#E78232','#E78031','#E77E31','#E77D31','#E77B30','#E77930','#E77830','#E7762F','#E7742F','#E7722F','#E7712E','#E76F2E','#E66D2E','#E66B2E','#E6692D','#E6672D','#E6662D','#E6642C','#E6622C','#E5602C','#E55E2B','#E55C2B','#E55A2B','#E4582A','#E4562A','#E45429','#E35229','#E35029','#E34E28','#E34C28','#E24A28','#E24827','#E14627','#E14427','#E14226','#E04026','#E03E26','#E03C25','#DF3A25','#DF3824','#DE3624','#DE3424','#DD3223','#DD3023','#DC2E22','#DC2C22','#DB2A22','#DB2821','#DA2621','#DA2421','#D92320','#D92120'];
var rainbow_mytax = {'depth_7': '#781C81', 'depth_8': '#781C81', 'depth_9': '#3F60AE', 'depth_10': '#3F60AE', 'depth_11': '#539EB6', 'depth_12': '#6DB388', 'depth_13': '#CAB843', 'depth_14': '#E78532', 'depth_15': '#D92120'};
var rainbow_ncbi = {'depth_7': '#781C81', 'depth_8': '#781C81', 'depth_9': '#3F60AE', 'depth_10': '#3F60AE', 'depth_11': '#6DB388', 'depth_12': '#D92120'};
var spectrum1 = ['#4D004D','#520053','#57005A','#5B0061','#600068','#64006F','#670077','#6B007E','#6E0085','#71008C','#730093','#750099','#7700A0','#7800A7','#7900AE','#7A00B5','#7A00BD','#7A00C4','#7A00CB','#7900D2','#7800D9','#7600E0','#7400E6','#7200ED','#6F00F4','#6C00FC','#6700FF','#6000FF','#5900FF','#5200FF','#4B00FF','#4300FF','#3C00FF','#3400FF','#2C00FF','#2300FF','#1A00FF','#1100FF','#0500FF','#000DFF','#0019FF','#0024FF','#002EFF','#0038FF','#0041FF','#004AFF','#0052FF','#005BFF','#0063FF','#006BFF','#0073FF','#007BFF','#0082FF','#008AFF','#0091FF','#0098FF','#00A0FF','#00A7FF','#00AEFF','#00B5FF','#00BCFF','#00C3FF','#00CAFF','#00D0FF','#00D7FF','#00DEFF','#00E4FF','#00EBFF','#00F1FF','#00F8FF','#00FEFF','#00FFF1','#00FFE1','#00FFD0','#00FFBF','#00FFAD','#00FF9C','#00FF89','#00FF76','#00FF62','#00FF4D','#00FF37','#00FF1E','#02FF00','#0DFF00','#16FF00','#1EFF00','#26FF00','#2DFF00','#34FF00','#3BFF00','#41FF00','#48FF00','#4EFF00','#54FF00','#5AFF00','#60FF00','#66FF00','#6BFF00','#71FF00','#77FF00','#7CFF00','#81FF00','#87FF00','#8CFF00','#91FF00','#97FF00','#9CFF00','#A1FF00','#A6FF00','#ABFF00','#B0FF00','#B5FF00','#BAFF00','#BFFF00','#C4FF00','#C9FF00','#CEFF00','#D3FF00','#D7FF00','#DCFF00','#E1FF00','#E6FF00','#EAFF00','#EFFF00','#F4FF00','#F8FF00','#FDFF00','#FFFD00','#FFF800','#FFF300','#FFEE00','#FFE900','#FFE400','#FFDE00','#FFD900','#FFD400','#FFCF00','#FFCA00','#FFC500','#FFBF00','#FFBA00','#FFB500','#FFAF00','#FFAA00','#FFA400','#FF9F00','#FF9900','#FF9400','#FF8E00','#FF8800','#FF8300','#FF7D00','#FF7700','#FF7100','#FF6B00','#FF6400','#FF5E00','#FF5800','#FF5100','#FF4B00','#FF4400','#FF3D00','#FF3600','#FF2E00','#FF2700','#FF1F00','#FF1600','#FF0C00','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FF0000','#FC0000','#F80000','#F40000','#F10000','#EE0000','#EA0000','#E60000','#E30000','#E00000','#DC0000','#D90000','#D50000','#D20000','#CE0000','#CB0000','#C70000','#C30000','#C00000','#BD0000','#B90000','#B50000','#B20000','#AF0000','#AB0000','#A70000','#A40000','#A00000','#9D0000','#990000','#960000','#930000','#8F0000','#8C0000','#880000','#850000','#810000','#7E0000','#7A0000','#760000','#730000','#700000','#6C0000','#680000','#650000','#620000','#5E0000','#5A0000','#570000','#530000','#500000','#4D0000'];
var spectrum2 = ['#0B0033','#0B0036','#0C0038','#0C003B','#0D003F','#0E0042','#0F0046','#0F004A','#10004E','#110052','#120057','#13005C','#140061','#150066','#16006B','#17006F','#180074','#1A007C','#1B0083','#1C0089','#1E0092','#20009A','#2100A1','#2300AA','#2400B3','#2600BB','#2800C4','#2900CD','#2A00D5','#2B00DD','#2C00E3','#2D00E9','#2E00EE','#2E00F1','#2D00F5','#2D00F8','#2D00FA','#2C00FC','#2B00FD','#2A00FE','#2800FE','#2700FF','#2500FF','#2300FF','#2100FF','#1E00FE','#1B00FE','#1700FE','#1300FD','#0F00FC','#0900FB','#0000FA','#000EF8','#0016F6','#001DF4','#0023F1','#0028EE','#002CEA','#0034E7','#003CE3','#0043DF','#0049DB','#004FD7','#0054D3','#005ACE','#0063CB','#006BC7','#0073C3','#007BC0','#0082BD','#0089BA','#0095B8','#00A1B6','#00AEB4','#00B3AA','#00B29C','#00B190','#00B186','#00B27E','#00B276','#00B36E','#00B467','#00B55F','#00B759','#00B954','#00BB50','#00BC4A','#00BF45','#00C13F','#00C339','#00C534','#00C72E','#00C928','#00CB21','#00CD19','#00CF0E','#09D100','#15D300','#1FD500','#28D600','#30D800','#38D900','#40DB00','#47DC00','#4DDE00','#53DF00','#5AE000','#60E100','#67E300','#6EE400','#75E500','#7DE600','#85E700','#8DE800','#95E900','#9EEA00','#A7EB00','#B1EC00','#BBED00','#C5ED00','#D0EE00','#DBEF00','#E7EF00','#F0EC00','#F0E100','#F1D700','#F1CC00','#F1C200','#F2B900','#F2B000','#F2A700','#F29E00','#F29500','#F28D00','#F18500','#F17E00','#F17800','#F07200','#F06C00','#EF6600','#EE5F00','#ED5A00','#EC5600','#EB5100','#EA4C00','#E84700','#E74300','#E53E00','#E43B00','#E23800','#E03400','#DE3100','#DC2D00','#D92A00','#D72700','#D42400','#D12100','#CE1F00','#CB1C00','#C81900','#C51700','#C21500','#BF1300','#BC1100','#B90F00','#B50D00','#B20B00','#AF0A00','#AB0800','#A80700','#A40500','#A10300','#9D0100','#9A0001','#960002','#920003','#8F0003','#8B0004','#880004','#840004','#810005','#7D0005','#790005','#760005','#730005','#6F0005','#6C0005','#690005','#660005','#630005','#610005','#5E0005','#5B0005','#590004','#560004','#530004','#500004','#4E0004','#4B0004','#490004','#460004','#440004','#420004','#400004','#3E0004','#3D0004','#3B0004','#390003','#370003','#360003','#340003','#320003','#310003','#2F0003','#2E0003','#2D0003','#2B0003','#2A0002','#290002','#270002','#260002','#250002','#240002','#230002','#220002','#210002','#1F0002','#1E0002','#1E0002','#1C0002','#1C0002','#1B0002','#1A0002','#190001','#180001','#170001','#170001','#160001','#150001','#150001','#140001','#130001','#130001','#120001','#120001','#110001','#110001','#100001','#100001','#0F0001','#0F0001','#0E0001','#0E0001','#0D0001','#0D0001','#0D0001'];


var greys = {
				1:['#969696'],
				2:['#cccccc','#525252'],
				3:['#d9d9d9','#bdbdbd','#636363'],
				4:['#d9d9d9','#bdbdbd','#969696','#525252'],
				5:['#d9d9d9','#bdbdbd','#969696','#636363','#252525'],
				6:['#d9d9d9','#bdbdbd','#969696','#636363','#252525', '#000000'],
				7:['#d9d9d9','#bdbdbd','#969696','#737373','#525252','#252525', '#000000'],
				8:['#eeeeee','#d9d9d9','#bdbdbd','#969696','#737373','#525252','#252525', '#000000'],
			};

var defaultColor = '#ccc';

// general transition
function standardTransition(transition) {
	transition
		.duration(500)
		.ease(d3.easeLinear);
}

var tree = [],
	entries = [],
	sortedEntries = [],
	sortedValues = [],
	segmentEntries = [],
	barcodeEntries = [],
	sortedBarcodeEntries = [],
	barcodeSegmentEntries = [],
	sortedBarcodeSegmentEntries = [],
	sortedSegmentEntries = [],
	maxSegmentValue = [],
	maxSegmentIndex = [],
	colorRampPiechart;

// set up plot parameters
var plot_margin = {top: 10, right: 20, bottom: 20, left: 20},
	plot_padding = {top: 10, right: 20, bottom: 20, left: 40},
	plot_outerWidth = 475,
	plot_outerHeight = plot_outerWidth/1.618,
	plot_innerWidth = plot_outerWidth - plot_margin.left - plot_margin.right,
	plot_innerHeight = plot_outerHeight - plot_margin.top - plot_margin.bottom,
	plot_width = plot_innerWidth - plot_padding.left - plot_padding.right,
	plot_height = plot_innerHeight - plot_padding.top - plot_padding.bottom;

function fixTime(t) {
	return new Date(t).getTime()/1000;
}

var allData = [],
	allMetadata = [],
	selectedAttribute;

var numRows = 3,
	numCols = 4;

var labelWidth = 15,
	labelHeight = 20,
	lastrows = 3,
	lastcols = 4;

var allBarcodes = Array.apply(null, new Array(numRows*numCols)).map((d,i) => {
		var pad = '00',
			barcodeNum = i+1;
		return 'BC' + (pad.substring(0, pad.length - ('' + barcodeNum).length) + barcodeNum);
	}),
	selectedBarcode = allBarcodes[0];
var barcodeData = {};

var treeData = [],
	pieChart = d3.stratify();

allBarcodes.map(d => {
	treeData[d] = [];
	treeData[d].push({'taxid': 'all', 'parent': null, 'label': 'all reads', 'level': 'no rank', 'size': 0});
});

//------------------------------------------------
// allow uploading of files
upload_button('uploader', load_dataset);

//==================================================================================================
// Main body
//==================================================================================================

//--------------------------------------------------------------------------------------------------
// auxiliary functions

//------------------------------------------------
// handle upload button
function upload_button(el, callback) {
// from: http://bl.ocks.org/syntagmatic/raw/3299303/
	var uploader = document.getElementById(el);
	var reader = new FileReader();
	reader.onload = function(e) {
		var contents = e.target.result;
		callback(contents);
	};

	uploader.addEventListener('change', handleFiles, false);

	function handleFiles() {
		d3.select('#table').text('loading...');
		var file = this.files[0];
		reader.readAsText(file);
	};
};

//------------------------------------------------
// load dataset and re-initialize display
function load_dataset(json) {

	var data = JSON.parse(json);

	if(data) {

		// create tree
		allBarcodes.map(b => {
			tree[b] = d3.stratify().id(d => d.taxid).parentId(d => d.parent)(treeData[b]); /* is this the most time-efficient place to generate the tree and the fields? */
			/* discovering that I could use d3.stratify to set up my hierarchy took me most of the day 2018-09-30 */

			// bubble sizes up through the hierarchy
			tree[b].sum(d => d.size);
		});

		tree['BC01'] = d3.hierarchy(data);
		tree['BC01'].sum(d => d.size);
		tree['BC01'].descendants().map(d => d.data.level = d.data.rank);
		tree['BC01'].descendants().map(d => d.data.label = d.data.name);

		console.log(tree['BC01'].descendants().filter(d => d.data.level == 'superkingdom'));

		// pull out field summary
		fields = data.metadata.fields;

		// identify values for "color by" dropdown list
		var dropdownOrder = d3.keys(fields).sort((a,b) => fields[a].rank_order - fields[b].rank_order),
			dropdownLabels = dropdownOrder.map(d => fields[d].name);

		// remove existing attributes
		var colorByAttributes = d3.select("#attributeDropdown");
		colorByAttributes.selectAll("li").remove();

		// populate attribute drop-down list
		colorByAttributes.selectAll("li")
			.data(dropdownLabels).enter()
			.append("li")
			.attr('class', 'dropdown-item')
			.attr("value", d => d)
			.text(d => d);

		// add text to selected display
		selectedAttribute = dropdownLabels[0];
		d3.select('#text-attribute').text(selectedAttribute);

		piechartPlotSVG.selectAll('g.slice').remove();
		piechartLegendSVG.selectAll('g.legendElement').remove();

		// draw pie chart + legend
		plotJSON('BC01');
	}
}

//------------------------------------------------
function legendClick() {

}



//==================================================================================================
//==================================================================================================
// barcode plate layout 
//==================================================================================================
//==================================================================================================

//------------------------------------------------
// define plate layout
var plateData = Array.apply(null, new Array(numRows*numCols)).map(d => 0),
	plateBarcodes = plateData.map(function(d,i) {
		var rowNum = i%numRows,
			row = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(rowNum,rowNum+1),
			col = Math.floor(i/numRows)+1,
			pad = '00',
			well = row + (pad.substring(0, pad.length - ('' + col).length) + col),
			barcodeNum = (col-1)*numRows + rowNum + 1,
			barcode = 'BC' + (pad.substring(0, pad.length - ('' + barcodeNum).length) + barcodeNum);

		return {'barcode': barcode, 'well': well, 'row': row, 'col': col, 'rowNum': rowNum, 'colNum': col-1};
	}),
	plateWidth = document.getElementById('svg_barcode_layout').offsetWidth - labelWidth - 10,
	plateHeight = 150,
	wellWidth = Math.min(Math.round(plateWidth/numCols),Math.round((plateHeight-labelHeight-5)/numRows)),
	wellHeight = Math.min(Math.round(plateWidth/numCols),Math.round((plateHeight-labelHeight-5)/numRows)),
	wellRadius = Math.max(1, Math.round(wellWidth/2 - wellWidth/15));

// use standard rows = letters, cols = numbers
var rows = [];
for(var i = 0; i < numRows; ++i) {
	rows.push(String.fromCharCode(i + 65));
}
var cols = d3.range(0, numCols, 1);


var barcodeLayoutSVG = d3.select('#svg_barcode_layout').append('svg')
				.attr('id', 'barcode_heatmap_svg')
				.attr('width', '100%')
				.attr('height', plateHeight)
			.append('g')
				.attr('transform', 'translate(50,0)');

var barcodeLegendSVG = d3.select('#svg_barcode_legend').append('svg')
				.attr('id', 'barcode_legend_svg')
				.attr('width', '100%')
				.attr('height', '180px');

//------------------------------------------------
// read URL parameters
var url_params = window.location.search.substring(1);

if(url_params) {
	// if URL parameters exist, use them
	params = URLToArray(url_params);
}

initBarcodeDisplay();

//================================================

//================================================
// Function declaration

function numberWithCommas(x) {
// from: http://stackoverflow.com/a/2901298
	var parts = x.toString().split('.');
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return parts.join('.');
}

//================================================
// initialize data by what is specified in the dropdown
function initBarcodeDisplay() {

	// remove any existing wells
	barcodeLayoutSVG.selectAll('.well').remove();

	// attach empty data for initialization
	barcodeLayoutSVG.selectAll('circle.well_shape')
		.data(allBarcodes.map(d => 0))
		.enter()
		.append('circle')
		.attr('transform', function(d, i) {
			return 'translate(' + (plateBarcodes[i].colNum * wellWidth) + ',' + (plateBarcodes[i].rowNum * wellHeight) + ')';
		})
		.attr('id', (d,i) => plateBarcodes[i].barcode)
		.attr('class', 'well_shape')
		.classed('selected', (d,i) => i == 0)
		.attr('cx', wellWidth/2 + labelWidth)
		.attr('cy', wellHeight/2 + labelHeight)
		.attr('r', wellRadius)
		.style('fill', '#f1f1f1')
		.style('stroke', '#ccc')
		.style('stroke-width', '1px')
		.style('cursor', 'pointer')
		.on('mouseover', function() {
			d3.select(this)
				.style('stroke', '#333')
				.style('stroke-width', '3px');
		})
		.on('mouseout', function(d,i) {
			d3.select(this)
				.style('stroke', selectedBarcode == allBarcodes[i] ? '#333' : '#ccc')
				.style('stroke-width', selectedBarcode == allBarcodes[i] ? '2px' : '1px');
		})
		.on('click', function() {
			selectedBarcode = d3.select(this).attr('id');

			// remove current well highlights
			d3.selectAll('.well_shape')
				.style('stroke-width', '1px')
				.style('stroke', '#ccc')

			// add new well highlights
			d3.select(this)
				.style('stroke-width', '2px')
				.style('stroke', '#333')

			//updateBarcodeData(); /* this isn't working */
			plotJSON(selectedBarcode);
		})
		.append('title')
		.attr('class', 'plate_tooltip')
		.text((d,i) => {
			var ret = 'well: ' + plateBarcodes[i].well;
			ret += '\n' + 'barcode: ' + plateBarcodes[i].barcode;
			ret += '\n' + 'total reads: ' + +d;
			return ret;
		});

	// update SVG
	updatePlate();
}

//================================================


//================================================
// update plate
function updatePlate() {

	//------------------------------------------------
	// define layout from data
//	numRows = document.getElementById('numrows').value;
//	numCols = document.getElementById('numcols').value;

	// define display parameters
	plateWidth = document.getElementById('svg_barcode_layout').offsetWidth - labelWidth - 10;
	wellWidth = Math.min(Math.round(plateWidth/numCols),Math.round((plateHeight-labelHeight-5)/numRows));
	wellHeight = Math.min(Math.round(plateWidth/numCols),Math.round((plateHeight-labelHeight-5)/numRows));
	wellRadius = Math.max(1, Math.round(wellWidth/2 - wellWidth/15));

	// use standard rows = letters, cols = numbers
	rows = [];
	for(var i = 0; i < numRows; ++i) {
		rows.push(String.fromCharCode(i + 65));
	}
	cols = d3.range(0, numCols, 1);

	//------------------------------------------------
	// Add row and column labels to plate layout

	// create row labels
	barcodeLayoutSVG.selectAll('g.rowLabel')
		.data(rows)
		.enter()
		.append('g')
			.attr('class', 'rowLabel')
			.attr('transform', function(d, i) {
				return 'translate(' + (labelWidth - 5) + ',' + (labelHeight + i * wellHeight) + ')';
			})
		.append('text')
			.attr('x', 0)
			.attr('y', wellHeight-wellRadius)
			.attr('text-anchor', 'middle')
			.text(d => d);

	// create column labels
	barcodeLayoutSVG.selectAll('g.colLabel')
		.data(cols)
		.enter()
		.append('g')
			.attr('class', 'colLabel')
			.attr('transform', function(d, i) {
				return 'translate(' + (labelWidth+i*wellWidth+wellWidth/2) + ',' + (-2) + ')';
			})
		.append('text')
			.attr('x', 0)
			.attr('y', labelHeight)
			.attr('text-anchor', 'middle')
			.text(d => d+1);

	// update SVG
//	updateBarcodeData();
}

//------------------------------------------------
// update data
function updateBarcodeData() {

	// attach data to circles
	var plateData = allBarcodes.map(d => (barcodeData[d])),
		well = barcodeLayoutSVG.selectAll('circle.well_shape')
			.data(plateData);

	// create color ramp for well fill color
	var legendMin = 0,
		legendMax = Math.ceil(Math.log10(d3.max(plateData.filter(d => d>0))));

	// create color scale
/*
	var colorRange = plasma,
		colorRampPlate = d3.scaleLinear()
			.domain(d3.range(legendMin, legendMax, (legendMax-legendMin)/256))
			.range(colorRange);
*/
	var colorScalePlate = plasma,
		colorRampPlate = d3.scaleLinear()
			.domain(d3.range(0, 1, 1.0 / (colorScalePlate.length - 1)))
			.range(colorScalePlate);
		c = d3.scaleLinear()
			.range([0,1])
			.domain([legendMin, legendMax]);

	//--------------------------------------------
	// Update existing wells
//	well.style('fill', function(d,i) {
	barcodeLayoutSVG.selectAll('circle.well_shape')
		.style('fill', function(d,i) {

			// default color grey, identify barcode and total reads for this well
			var ret = '#f1f1f1',
				barcode = allBarcodes[i],
				val = d,
				entry = sortedBarcodeEntries[selectedAttribute][barcode];

			console.log(entry);

			ret = colorRampPiechart(entry[0].value);

			return ret;
		})
		.style('stroke', (d,i) => selectedBarcode == allBarcodes[i] ? '#333' : '#ccc')
		.style('stroke-width', (d,i) => selectedBarcode == allBarcodes[i] ? '2px' : '1px');

//	well.select('title.plate_tooltip')
	barcodeLayoutSVG.selectAll('circle.well_shape')
		.select('title.plate_tooltip')
		.text(function(d,i) {
			var ret = 'well: ' + plateBarcodes[i].well,
				val = d;
			ret += '\n' + 'barcode: ' + plateBarcodes[i].barcode;
			ret += '\n' + 'total reads: ' + numberWithCommas(+val);
			return ret;
		});

	//--------------------------------------------
	// remove existing legend
	d3.selectAll('g.barcodeLegend').remove();
	d3.selectAll('g.barcodeLegendtext').remove();
	d3.selectAll('g.barcodeLegendtitle').remove();

	//--------------------------------------------
	// Create legend rectangle

	// get data for legend
	var legendEntries = d3.keys(sortedBarcodeEntries[selectedAttribute])
		.map(key => sortedBarcodeEntries[selectedAttribute][key][0].value)
		.sort()
		.filter(onlyUnique).map(d => d.replace(/^value_/, ''));

	//============================================
	// draw legend
	//============================================

	// draw Legend
	var legendElement = barcodeLegendSVG.selectAll('g.barcodeLegend')
		.data(legendEntries);

	legendElement.exit().remove();

	var legendEnter = legendElement.enter()
		.append('g').attr('class', 'barcodeLegend')
		.on('click', legendClick);

	legendEnter.append('rect')
		.attr('x', 0)
		.attr('y', 0)
		.attr('width', 25)
		.attr('height', 25)
		.style('fill', defaultColor);

	legendEnter.append('text')
		.attr('x', 35)
		.attr('y', 18)
		.style('font-size', '14px');

	var legendUpdate = legendElement.merge(legendEnter)
		.transition().duration(0)
		.attr('transform', function(d,i) {
			return 'translate(0,' + (i*30) + ')';
		});

	legendUpdate.selectAll('rect')
		.style('fill', function(d) {
			var ret = defaultColor;
			if(d == '') {
				ret = emptyColor;
			} else if(d) {
				ret = colorRampPiechart('value_' + d);
			}
			return ret;
		});

	legendUpdate.selectAll('text')
		.text(d => d);
}


//==================================================================================================
//==================================================================================================
// pie chart
//==================================================================================================
//==================================================================================================

// for continuous variables
// from: https://stackoverflow.com/a/17672702
/*
var colorScale = rainbow2,
	colorRamp = d3.scaleLinear()
		.domain(d3.range(0, 1, 1.0 / (colorScale.length - 1)))
		.range(colorScale);
	c = d3.scaleLinear()
		.range([0,1]);

*/

// for categorical variables
var emptyColor = d3.schemeCategory10[0],
	colorScalePiechart = d3.schemeCategory10.slice(1);

var piechartPlotSVG = d3.select('#svg_wrapper').append('svg')
		.style('width', '100%')
		.style('height', '500px')
		.attr('id', 'piechartPlotSVG');

const pieWidth = 800,//document.getElementById('svg_wrapper').offsetWidth,
	pieHeight = 800,//pieWidth,
	maxRadius = Math.round(pieHeight/2);

piechartPlotSVG
	.style('height', pieHeight + 'px')
	.attr('viewBox', `${-pieWidth/2} ${-pieHeight/2} ${pieWidth} ${pieHeight}`)
//	.on('click', () => focusOn(11308)); // Reset zoom on canvas click

const piechartLegendSVG = d3.select('#legend_wrapper').append('svg')
	.style('width', '100%')
	.style('height', pieHeight);

const formatNumber = d3.format(',d');

const x = d3.scaleLinear()
	.range([0, 2 * Math.PI])
	.clamp(true);

const y = d3.scaleSqrt()
	.range([maxRadius*.05, maxRadius]);

const partition = d3.partition();

const arc = d3.arc()
	.startAngle(d => x(d.x0))
	.endAngle(d => x(d.x1))
	.innerRadius(d => Math.max(0, y(d.y0)))
	.outerRadius(d => Math.max(0, y(d.y1)));

const middleArcLine = d => {
	const halfPi = Math.PI/2;
	const angles = [x(d.x0) - halfPi, x(d.x1) - halfPi];
	const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);

	const middleAngle = (angles[1] + angles[0]) / 2;
	const invertDirection = middleAngle > 0 && middleAngle < Math.PI; // On lower quadrants write text ccw
	if (invertDirection) { angles.reverse(); }

	const path = d3.path();
	path.arc(0, 0, r, angles[0], angles[1], invertDirection);
	return path.toString();
};

const textFits = d => {
	const CHAR_SPACE = 14;

	const deltaAngle = x(d.x1) - x(d.x0);
	const r = Math.max(0, (y(d.y0) + y(d.y1)) / 2);
	const perimeter = r * deltaAngle;

	return d.data.label.length * CHAR_SPACE < perimeter;
};

var data,
	root,
	headers,
	fields;

//==================================================================================================
// Main body
//==================================================================================================

//--------------------------------------------------------------------------------------------------
// auxiliary functions

//------------------------------------------------
function legendClick() {

}

//------------------------------------------------
function selectAttribute(text) {

	// update attribute
	selectedAttribute = text;

	// update plot
	plotJSON();
	//updateBarcodeData();
}

//------------------------------------------------
// load dataset and re-initialize display
function plotJSON(barcode) {

	// remove existing pie chart + legend /* this is obviously not ideal (D3 updates would clearly be better), but it works for now */
	piechartPlotSVG.selectAll('g.slice').remove();
	piechartLegendSVG.selectAll('g.legendElement').remove();

	// draw pie chart + legend
	//----------------------------------------

	// pull values for this attribute
	thisAttribute = selectedAttribute;

	// grab all values across all barcodes
	var combinedValues = allBarcodes.map(d => tree[d].descendants().filter(e => e.data.level == thisAttribute))
			.reduce((a,b) => a.concat(b)),
		combinedCount = [];

	// store combined sum across all barcodes
	d3.keys(combinedValues).map(d => {

		// prefix value with a string in case it could be simplified as an integer /* I'm not sure how important this is, but JavaScript was returning Arrays with a size >1e9 due to my taxids */
		var value = 'value_' + combinedValues[d].data.label;

		// get total sum across all barcodes
		if(combinedCount[value]) {
			combinedCount[value] += combinedValues[d].value;
		} else {
			combinedCount[value] = combinedValues[d].value;
		}
	});

	// create value/count dict for each attribute
	entries[thisAttribute] = d3.keys(combinedCount).map(d => ({'value': d, 'count': combinedCount[d]}));

	// sort entries in descending order /* the reason this isn't combined with the above is the filter(onlyUnique), although that seems doable */
	sortedEntries[thisAttribute] = entries[thisAttribute].map(d => d.value)
		.filter(onlyUnique).map(d => ({
			'value': d,
			'count': entries[thisAttribute].filter(e => e.value == d).map(e => e.count).reduce((a,b) => a + b)
		}))
		.sort((a,b) => +b.count - +a.count);

	// grab array of just values
	sortedValues[thisAttribute] = sortedEntries[thisAttribute].map(f => f.value)
		.filter(d => d.length > 0);

	// grab entries just for this barcode (for piechart legend)
	barcodeEntries[thisAttribute] = [];
	allBarcodes.map(checkBarcode => {
		barcodeEntries[thisAttribute][checkBarcode] = tree[checkBarcode].descendants()
			.filter(d => d.data.level == thisAttribute)
			.map(d => ({'value': ('value_' + d.data.label), 'count': d.value} ))
			.sort((a,b) => +b.count - +a.count);
		if(!sortedBarcodeEntries[thisAttribute]) {
			sortedBarcodeEntries[thisAttribute] = [];
		}
		sortedBarcodeEntries[thisAttribute][checkBarcode] = barcodeEntries[thisAttribute][checkBarcode].map(d => d.value)
			.filter(onlyUnique).map(d => ({
				'value': d,
				'count': barcodeEntries[thisAttribute][checkBarcode].filter(e => e.value == d).map(e => e.count).reduce((a,b) => a + b)
			}))
			.sort((a,b) => +b.count - +a.count);
	});


	// store segment information for all barcodes
	barcodeSegmentEntries[thisAttribute] = [];
	sortedBarcodeSegmentEntries[thisAttribute] = [];

	// create output table
	var tableContent = [];
	allMetadata.map(d => {

		// push object to table row
/*		tableContent.push(obj); */
	});

	var fields = d3.keys(tableContent[0]),
		fieldTitles = d3.keys(tableContent[0]);

	// add table to HTML
	createTable(tableContent, fields, fieldTitles);

	// draw pie chart + legend
	drawPiechart();
}

//------------------------------------------------
// create table element
function createTable(objectArray, fields, fieldTitles) {
// from: https://stackoverflow.com/a/52579509

	d3.select('#outputData').selectAll('table').remove();

	let tableDiv = document.getElementById('outputData');
	let table = document.createElement('table');
	let thead = document.createElement('thead');
	let thr = document.createElement('tr');
	fieldTitles.forEach((fieldTitle) => {
		let th = document.createElement('th');
		th.appendChild(document.createTextNode(fieldTitle));
		thr.appendChild(th);
	});
	thead.appendChild(thr);
	table.appendChild(thead);

	let tbdy = document.createElement('tbody');
	let tr = document.createElement('tr');
	objectArray.forEach((object) => {
		let tr = document.createElement('tr');
		fields.forEach((field) => {
			var td = document.createElement('td');
			td.appendChild(document.createTextNode(object[field]));
			tr.appendChild(td);
		});
		tbdy.appendChild(tr);
	});
	table.appendChild(tbdy);
	table.className = 'table';
	tableDiv.appendChild(table);
	return table;
}
//------------------------------------------------
function moveStackToFront(elD) {
	piechartPlotSVG.selectAll('.slice').filter(d => d === elD)
		.each(function(d) {
			this.parentNode.appendChild(this);
			if (d.parent) { moveStackToFront(d.parent); }
		})
}

//------------------------------------------------
function focusOn(d = { x0: 0, x1: 1, y0: 0, y1: 1 }) {
	// Reset to top-level if no data point specified
	//console.log(d);
	const transition = piechartPlotSVG.transition()
		.duration(750)
		.tween('scale', () => {
			const xd = d3.interpolate(x.domain(), [d.x0, d.x1]),
				yd = d3.interpolate(y.domain(), [d.y0, 1]);
			return t => { x.domain(xd(t)); y.domain(yd(t)); };
		});

	transition.selectAll('path.main-arc')
		.attrTween('d', d => () => arc(d));

	transition.selectAll('path.hidden-arc')
		.attrTween('d', d => () => middleArcLine(d));

	transition.selectAll('text')
		.attrTween('display', d => () => textFits(d) ? null : 'none');

	moveStackToFront(d);
}

//------------------------------------------------
function computeTextRotation(d) {
	return (x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
}

//------------------------------------------------
function jumpTo(taxid) {
	focusOn(tree[selectedBarcode].descendants().filter(function(d){ return d.data.taxid == taxid; })[0])
}
//------------------------------------------------
function onlyUnique(value, index, self) {
	return self.indexOf(value) === index;
}

//--------------------------------------------------------------------------------------------------
// create pie chart
function drawPiechart() {

	colorRampPiechart = d3.scaleOrdinal(colorScalePiechart)
		.domain(sortedValues[selectedAttribute]);

	//============================================
	// draw piechart
	//============================================

//	var selected = partition(root).descendants().filter(function(d){ return d.data.taxid == 10239; })[0];
//	var selected = partition(treeData).descendants().filter(d => d.size[SelectedBarcode] > 0);
//	var selected = partition(tree).descendants().filter(function(d){ return d.data.taxid == 10239; })[0];

	console.log(tree[selectedBarcode]);

	//--------------------------------------------
	// draw slices
	const slice = piechartPlotSVG.selectAll('g.slice')
		.data(partition(tree[selectedBarcode]).descendants(), d => d.id);

	slice.exit().remove();

	const sliceEnter = slice.enter()
		.append('g')
		.attr('class', function(d) {
			return ('slice depth_' + d.depth);
		})
		.on('click', function(d) {
			d3.event.stopPropagation();
			focusOn(d);
		});

	sliceEnter.append('title')
		.text(function(d) { 
			var ret = 'Label: ' + d.data.label + '\nReads: ' + formatNumber(d.value);
			if(d.data.segment) {
				ret += '\nSegment: ' + d.data.segment;
			}
			if(d.data.subtype) {
				ret += '\nSubtype: ' + d.data.subtype;
			}
			if(d.data.host) {
				ret += '\nHost: ' + d.data.host;
			}
			if(d.data.clade) {
				ret += '\nClade: ' + d.data.clade;
			}
			if(d.data.year) {
				ret += '\nYear: ' + d.data.year;
			}
//			var ret = d.data.level + ': ' + d.data.label + '\nReads: ' + formatNumber(d.value);
			return ret;
		});

	sliceEnter.append('path')
		.attr('class', 'hidden-arc')
		.attr('id', (_, i) => `hiddenArc${i}`)
		.attr('d', middleArcLine);

	sliceEnter.append('path')
		.attr('class', 'main-arc')
		.style('fill', '#ccc')
		.on('mouseover', function(d) {
			var currentEl = d3.select(this);
			currentEl.style('fill-opacity', 0.5);
		})
		.on('mouseout', function(d) {
			var currentEl = d3.select(this);
			currentEl.style('fill-opacity', 1);
		});

	var sliceUpdate = slice.merge(sliceEnter)
		.transition().call(standardTransition);

	sliceUpdate.selectAll('.main-arc')
		.attr('d', arc) /* I moved this from sliceEnter to sliceUpdate in the hopes of dynamically zooming in */
		.style('fill', function(d) {
			var e = (d.children ? d : d.parent),
				ret = defaultColor;
			if(e !== null) {
				if(e.data.taxid > 0) {
					if(d3.keys(e.data).indexOf(selectedAttribute) == -1) {
						ret = emptyColor;
					} else {
//						if(selectedAttribute == 'segment') {
//							ret = colorRampPiechart(e.data[selectedAttribute].slice(0,1));
//						} else {
							ret = colorRampPiechart('value_' + e.data[selectedAttribute]);
//							ret = colorRampPiechart(e.data.label);
//						}
					}
				}
			}
			return ret;
		});

	//--------------------------------------------
	// draw text
	const text = sliceEnter.append('text')
		.attr('display', d => textFits(d) ? null : 'none');

	// Add white contour
	text.append('textPath')
		.attr('startOffset','50%')
		.attr('xlink:href', (_, i) => `#hiddenArc${i}` )
		.text(d => d.data.label)
		.style('font-size', '24px')
		.style('fill', 'none')
		.style('stroke', '#fff')
		.style('stroke-width', 2)
		.style('stroke-linejoin', 'round');

	text.append('textPath')
		.attr('startOffset','50%')
		.attr('xlink:href', (_, i) => `#hiddenArc${i}` )
		.text(d => d.data.label)
		.style('font-size', '24px')
		.style('fill', '#fff');

	//============================================
	// draw legend
	//============================================

	// draw Legend
	var legendElement = piechartLegendSVG.selectAll('g.legendElement')
		.data(sortedBarcodeEntries[selectedAttribute][selectedBarcode], function(d) {
			return selectedAttribute + d.value + d.count;
		});

	legendElement.exit().remove();

	var legendEnter = legendElement.enter()
		.append('g').attr('class', 'legendElement')
		.on('click', legendClick);

	legendEnter.append('rect')
		.attr('x', 0)
		.attr('y', 0)
		.attr('width', 25)
		.attr('height', 25)
		.style('fill', defaultColor);

	legendEnter.append('text')
		.attr('x', 35)
		.attr('y', 18)
		.style('font-size', '14px');

	var legendUpdate = legendElement.merge(legendEnter)
		.transition().duration(0)
		.attr('transform', function(d,i) {
			return 'translate(0,' + (i*30) + ')';
		});

	legendUpdate.selectAll('rect')
		.style('fill', function(d) {
			var ret = defaultColor;
			if(d.value == '') {
				ret = emptyColor;
			} else if(d.value) {
					ret = colorRampPiechart(d.value);
			}
			return ret;
		});

	legendUpdate.selectAll('text')
		.text(function(d){
			var val = d.value.replace(/^value_/, '');
			if(val == '') {
				val = 'no ' + selectedAttribute + ' listed';
			}
			return val + ' (' + d.count.toLocaleString() + ')';
		});
}

d3.select('#jumpBacteria')
	.on('click', function() {
		jumpTo(2);
	});
d3.select('#jumpViruses')
	.on('click', function() {
		jumpTo(10239);
	});
d3.select('#jumpFungi')
	.on('click', function() {
		jumpTo(4751);
	});
d3.select('#jumpEukaryota')
	.on('click', function() {
		jumpTo(2759);
	});
d3.select('#jumpArchaea')
	.on('click', function() {
		jumpTo(2157);
	});
d3.select('#jumpReset')
	.on('click', jumpTo);



//==================================================================================================
//==================================================================================================
// miscellaneous infrastructure
//==================================================================================================
//==================================================================================================

function recolor(colorscale) {
	d3.keys(colorscale).map(function(d) {
		d3.selectAll('g.' + d)
		  .selectAll('path.main-arc')
		  .style('fill', colorscale[d]);
	});
}

function colorNCBI() {
	recolor(rainbow_ncbi);
}

function colorMyTax() {
	recolor(rainbow_mytax);
}

function downloadSVG() {

    // get kmer SVG, add xmlns attribute
    var svg = d3.select("#piechartPlotSVG")
        .attr("title", "lca_sunburst")
        .attr("xmlns", "http://www.w3.org/1999/xhtml")
        .node();

    // convert to XML, add proper encoding and indentation
    var svg_xml = (new XMLSerializer()).serializeToString(svg);
    svg_xml = '<?xml version="1.0" encoding="ISO-8859-1"?>\n' + vkbeautify.xml(svg_xml);

	console.log(svg_xml);

    // download file
    d3.select('#download_a')
        .attr("href", 'data:application/octet-stream;base64,' + btoa(svg_xml))
        .attr("download", "sunburst.svg");
}

// handle tabs
function openTab(evt, tabName) {
    // Declare all variables
    var i, tabcontent, tablinks;

    // Get all elements with class='tabcontent' and hide them
    tabcontent = document.getElementsByClassName('tabcontent');
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = 'none';
    }

    // Get all elements with class='tablinks' and remove the class 'active'
    tablinks = document.getElementsByClassName('tablinks');
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(' active', '');
    }

    // Show the current tab, and add an 'active' class to the button that opened the tab
    document.getElementById(tabName).style.display = 'block';
    evt.currentTarget.className += ' active';
}

// open default tab
document.getElementById('defaultOpen').click();


//==================================================================================================
// jQuery main body
//==================================================================================================
$(document).ready(function() {

	//----------------------------------------------------------------------------------------------
	// handle updating dropdown fields
	// from: http://www.benknowscode.com/2013/12/bootstrap-dropdown-button-select-box-control.html
	$( document.body ).on( 'click', '.dropdown-menu li', function( event ) {

		// define object variables
		var group = this.parentNode.parentNode.parentNode.parentNode,
			textBox = group.querySelector('.wrap-text'),
			btn = d3.select(group.querySelector('.btn'));

		var $target = $( event.currentTarget );

		// set text box text and attributes
		d3.select(textBox)
			.attr('value', $target.attr('value'))
			.text($target.text());

		// turn dropdown green
		if(!btn.classed('btn-info')) {
			btn.classed('btn-danger', false)
				.classed('btn-success', true);
		}

		// check submit button classes
		selectAttribute($target.text());

		// toggle dropdown
		group.querySelector('.dropdown-toggle').dropdown('toggle'); // this line throws an error, but is necessary to toggle the dropdown...I need to learn more

		return false;
	});

});
