
# conda create -f environment.yaml


## Make sure that mytax env is activated first!
# # Install kraken1
# rm -rf $CONDA_PREFIX/lib/kraken1
# git clone https://github.com/DerrickWood/kraken.git $CONDA_PREFIX/lib/kraken1
# cd $CONDA_PREFIX/lib/kraken1
# echo $PWD
# bash install_kraken.sh $CONDA_PREFIX/bin

# find envs -name "*.yml" -exec conda create -f {} \;

#If you have a Mac, make sure Xcode is updated and installed. If windows, use cygwin or install in a docker container
# try
    git clone https://github.com/infphilo/centrifuge $CONDA_PREFIX/lib/centrifuge && \
    make -C $CONDA_PREFIX/lib/centrifuge && \
    make install -C $CONDA_PREFIX/lib/centrifuge prefix=$CONDA_PREFIX || # catch
    cp $CONDA_PREFIX/lib/centrifuge/centrifuge-* $CONDA_PREFIX/bin/ && chmod +x $CONDA_PREFIX/bin/centrifuge*



