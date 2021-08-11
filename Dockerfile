FROM continuumio/miniconda3:4.9.2

WORKDIR /opt/software

# Make RUN commands use `bash --login` (always source ~/.bashrc on each RUN)
SHELL ["/bin/bash", "--login", "-c"]

# install apt dependencies and update conda
RUN apt-get update && apt-get install git -y \
    && apt-get install -y apt-transport-https ca-certificates wget unzip bzip2 libfontconfig1 \
    && update-ca-certificates \
    && apt-get -qq -y remove curl \
    && apt-get -qq -y autoremove \
    && apt-get autoclean \
    && rm -rf /var/lib/apt/lists/* /var/log/dpkg.log 

ENV PATH /opt/conda/bin:$PATH
RUN conda config --set ssl_verify no
COPY ./environment.yml /opt/environment.yml

RUN conda env create -f /opt/environment.yml

WORKDIR /opt/software/mytax
COPY src /opt/software/mytax
RUN wget http://ccb.jhu.edu/software/kraken/dl/minikraken_20171019_4GB.tgz
RUN ls
RUN tar -xvzf minikraken_20171019_4GB.tgz 
RUN mv minikraken_20171013_4GB minikraken && rm  minikraken_20171019_4GB.tgz
RUN conda activate mytax && bash process_krakendb.sh -k minikraken
RUN echo end
RUN conda activate mytax && \
    find . -name "*.sh" | while read fn; do ln -s $PWD/$fn /usr/local/bin; done && \ 
    bash build_flukraken.sh -k flukraken
COPY sunburst /opt/software/mytax/sunburst

# The code to run when container is started:
# ENTRYPOINT ["bash", "./entrypoint.sh"]
# ENTRYPOINT ["conda", "run", "--no-capture-output", "-n", "mytax"]

