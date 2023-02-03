FROM continuumio/miniconda3:4.9.2


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

# Set up conda environment
ENV PATH /opt/conda/bin:$PATH
RUN conda config --set ssl_verify no
COPY ./environment.yml /opt/environment.yml
RUN conda env create -f /opt/environment.yml



SHELL ["conda", "run", "-n", "mytax2", "/bin/bash", "-c"]

WORKDIR /opt

# RUN  echo "cloning Mytax v2 image" && git clone https://github.com/jhuapl-bio/AGAVE.git
RUN wget https://mirror.oxfordnanoportal.com/software/analysis/ont-guppy_5.1.15_linux64.tar.gz -O /opt/guppy_5.tar.gz && \
    tar -xvzf /opt/guppy_5.tar.gz && \
    ln -sf /opt/ont-guppy/bin/guppy_barcoder /usr/local/bin/guppy_barcoder && rm /opt/guppy_5.tar.gz
    
COPY ./package.json /opt/package.json

RUN npm install 

COPY ./babel.config.js /opt/babel.config.js
COPY ./jsconfig.json /opt/jsconfig.js
COPY ./vue.config.js /opt/vue.config.js
COPY ./src /opt/src
COPY ./server /opt/server
# RUN npm run build
# RUN mkdir -p /MYTAX; cp -r ./dist/* /MYTAX/
COPY dist /MYTAX
COPY nginx.conf /etc/nginx/nginx.conf
RUN useradd nginx 
# RUN chown -R nginx:nginx /var/lib/nginx && \
#         chown -R nginx:nginx /var/log/nginx && \
#         chown -R nginx:nginx /etc/nginx/conf.d
# RUN touch /var/run/nginx.pid && \
#         chown -R nginx:nginx /var/run/nginx.pid
RUN chmod -R 777 /MYTAX

CMD ["conda", "run", "-n", "mytax2", "/bin/bash", "-c"]

# To Run docker build . -t jhuaplbio/basestack_mytax2 ; doacker container run -it --rm -p 8098:80 jhuaplbio/basestack_mytax2  bash -c "nginx; bash "