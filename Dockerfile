FROM nvidia/cuda:12.2.0-base-ubuntu20.04


# Make RUN commands use `bash --login` (always source ~/.bashrc on each RUN)
SHELL ["/bin/bash", "--login", "-c"]
ARG DEBIAN_FRONTEND=noninteractive

# install apt dependencies and update conda
RUN apt-get  --allow-releaseinfo-change  update
RUN apt-get install git -y \
    && apt-get install -y nginx apt-transport-https ca-certificates wget unzip bzip2 libfontconfig1

RUN update-ca-certificates \
    && apt-get install -y g++ gcc gawk bzip2 \
    && apt-get -qq -y autoremove \
    && apt-get autoclean 
RUN apt-get install -y curl
RUN apt-get -y install software-properties-common && add-apt-repository ppa:deadsnakes/ppa && apt update -y 
RUN apt-get install -y python3.8
RUN apt-get install -y python3-pip
RUN python3 -m pip install anytree==2.8.0 pandas
RUN curl -fsSL https://deb.nodesource.com/setup_17.x | bash -
RUN apt-get install -y nodejs

WORKDIR /opt

# Get Guppy barcoder for demux purposes
RUN wget https://cdn.oxfordnanoportal.com/software/analysis/ont-guppy_6.4.6_linux64.tar.gz -O ./guppy_6_gpu.tar.gz
RUN wget https://cdn.oxfordnanoportal.com/software/analysis/ont-guppy-cpu_6.4.6_linux64.tar.gz -O ./guppy_6_cpu.tar.gz
RUN    tar -xvzf /opt/guppy_6_gpu.tar.gz && mv /opt/ont-guppy /opt/ont-guppy-gpu  && rm /opt/guppy_6_gpu.tar.gz
RUN tar -xvzf /opt/guppy_6_cpu.tar.gz && mv /opt/ont-guppy-cpu /opt/ont-guppy && \
    ln -sf /opt/ont-guppy/bin/guppy_barcoder /usr/local/bin/guppy_barcoder && \
    rm /opt/guppy_6_cpu.tar.gz

RUN wget https://github.com/DerrickWood/kraken2/archive/refs/tags/v2.1.3.tar.gz -O kraken2.tar.gz && tar -xvzf kraken2.tar.gz && rm kraken2.tar.gz && cd kraken2-2.1.3 && ./install_kraken2.sh /usr/bin/
    
RUN git clone https://github.com/jenniferlu717/KrakenTools.git && cd KrakenTools && chmod +x *.py && find . -name "*.py" -exec cp {} /usr/local/bin/ \;
RUN ln -s /usr/bin/python3 /usr/bin/python
COPY ./package.json /opt/package.json

RUN npm install 

COPY ./babel.config.js /opt/babel.config.js
COPY ./.eslintignore /opt/.eslintignore
COPY ./jsconfig.json /opt/jsconfig.js
COPY ./vue.config.docker.js /opt/vue.config.js
COPY ./src /opt/src
RUN npm run build
COPY ./server /opt/server
# COPY dist  /usr/share/nginx/html/mytax
COPY nginx.conf /etc/nginx/nginx.conf
RUN useradd nginx 
# RUN chown -R nginx:nginx /var/lib/nginx && \
#         chown -R nginx:nginx /var/log/nginx && \
#         chown -R nginx:nginx /etc/nginx/conf.d
# RUN touch /var/run/nginx.pid && \
#         chown -R nginx:nginx /var/run/nginx.pid
RUN ln -s /opt/dist /usr/share/nginx/html/mytax && chmod -R 777 /usr/share/nginx/html/mytax
EXPOSE 80

# CMD ["conda", "run", "-n", "mytax2", "/bin/bash", "-c"]

# To Run docker build . -t jhuaplbio/basestack_mytax2 ; docker container run -it --rm -p 8098:80 jhuaplbio/basestack_mytax2  bash -c "nginx; bash "