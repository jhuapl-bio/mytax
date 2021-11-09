#conda create -f environment.yaml 
#If you have a Mac, make sure Xcode is updated and installed. If windows, use cygwin or install in a docker container

git clone https://github.com/infphilo/centrifuge $CONDA_PREFIX/lib/centrifuge
make -C $CONDA_PREFIX/lib/centrifuge 
make install -C $CONDA_PREFIX/lib/centrifuge prefix=$CONDA_PREFIX
