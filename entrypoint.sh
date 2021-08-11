#!/bin/bash --login
# The --login ensures the bash configuration is loaded,
# enabling Conda.
set +u
source /opt/conda/etc/profile.d/conda.sh
conda activate mytax

