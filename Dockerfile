FROM continuumio/miniconda3:4.9.2

WORKDIR /opt/software

# Make RUN commands use `bash --login` (always source ~/.bashrc on each RUN)
SHELL ["/bin/bash", "--login", "-c"]

# install apt dependencies and update conda
RUN apt-get  --allow-releaseinfo-change  update && apt-get install git -y \
    && apt-get install -y apt-transport-https ca-certificates wget unzip bzip2 libfontconfig1 \
    && update-ca-certificates \
    && apt-get -qq -y remove curl \
    && apt-get install -y g++ gcc \
    && apt-get -qq -y autoremove \
    && apt-get autoclean \
    && rm -rf /var/lib/apt/lists/* /var/log/dpkg.log 

# Set up conda environment
ENV PATH /opt/conda/bin:$PATH
RUN conda config --set ssl_verify no
COPY ./environment.yml /opt/environment.yml
RUN conda env create -f /opt/environment.yml

SHELL ["conda", "run", "-n", "mytax", "/bin/bash", "-c"]
# Clone centrifuge

# compile centrifuge from source
# RUN git clone https://github.com/infphilo/centrifuge /opt/conda/envs/mytax/lib/centrifuge
# RUN make -C \$CONDA_PREFIX/lib/centrifuge 
# RUN make install -C \$CONDA_PREFIX/lib/centrifuge prefix=\$CONDA_PREFIX

COPY ./install.sh /opt/install.sh 
RUN bash /opt/install.sh



# Define databases that are shipped with the image
COPY databases /opt/databases

WORKDIR /opt/databases
RUN wget http://ccb.jhu.edu/software/kraken/dl/minikraken_20171019_4GB.tgz && \
    tar -xvzf minikraken_20171019_4GB.tgz && \
    mkdir -p /opt/databases && \
    mv minikraken_20171013_4GB /opt/databases/minikraken && \
    rm minikraken_20171019_4GB.tgz

# RUN find /opt/databases -name "*tar.gz" -exec tar -xvzf {} \;
WORKDIR /opt/software/mytax
COPY src /opt/software/mytax
RUN find . -name "*.sh" | while read fn; do ln -s $PWD/$fn /usr/local/bin; done 
RUN conda activate mytax && bash process_krakendb.sh -k /opt/databases/minikraken

# Define Flukraken by building from source with jellyfish and whatnot
RUN conda activate mytax && \
    bash build_flukraken.sh -k flukraken && \
    rm -r flukraken/library flukraken/raw flukraken/database.jdb* && \
    tar c flukraken | gzip -c | tee flukraken.tar.gz && \
    rm -rf flukraken

COPY sunburst /opt/software/mytax/sunburst
ENTRYPOINT ["conda", "run", "--no-capture-output", "-n", "mytax", "bash", "-c"]


