FROM nvidia/cuda:11.5.1-base-ubuntu18.04


# Make RUN commands use `bash --login` (always source ~/.bashrc on each RUN)
SHELL ["/bin/bash", "--login", "-c"]

# install apt dependencies and update conda
RUN apt-get  --allow-releaseinfo-change  update && apt-get install git -y \
    && apt-get install -y nginx apt-transport-https ca-certificates wget unzip bzip2 libfontconfig1 \
    && update-ca-certificates \
    && apt-get -qq -y remove curl \
    && apt-get install -y g++ gcc \
    && apt-get -qq -y autoremove \
    && apt-get autoclean 


ENV CONDA_DIR /opt/conda
RUN wget --quiet https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda.sh && /bin/bash ~/miniconda.sh -b -p /opt/conda

# Set up conda environment
ENV PATH /opt/conda/bin:$PATH
RUN conda config --set ssl_verify no
COPY ./environment.yml /opt/environment.yml
RUN conda env create -f /opt/environment.yml



SHELL ["conda", "run", "-n", "mytax2", "/bin/bash", "-c"]

WORKDIR /opt

# Get Guppy barcoder for demux purposes
RUN wget https://mirror.oxfordnanoportal.com/software/analysis/ont-guppy_6.4.6_linux64.tar.gz -O ./guppy_6_gpu.tar.gz
RUN wget https://mirror.oxfordnanoportal.com/software/analysis/ont-guppy-cpu_6.4.6_linux64.tar.gz -O ./guppy_6_cpu.tar.gz
RUN    tar -xvzf /opt/guppy_6_gpu.tar.gz && mv /opt/ont-guppy /opt/ont-guppy-gpu  && rm /opt/guppy_6_gpu.tar.gz
RUN tar -xvzf /opt/guppy_6_cpu.tar.gz && mv /opt/ont-guppy-cpu /opt/ont-guppy && \
    ln -sf /opt/ont-guppy/bin/guppy_barcoder /usr/local/bin/guppy_barcoder && \
    rm /opt/guppy_6_cpu.tar.gz
    
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

CMD ["conda", "run", "-n", "mytax2", "/bin/bash", "-c"]

# To Run docker build . -t jhuaplbio/basestack_mytax2 ; doacker container run -it --rm -p 8098:80 jhuaplbio/basestack_mytax2  bash -c "nginx; bash "