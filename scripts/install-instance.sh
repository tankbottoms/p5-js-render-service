DIR=$(pwd)
TARGET_DIR="p5js-render-service"


# Create the directory structure on the instance
gcloud compute ssh rooot@pinning-service --zone us-central1-a -- "mkdir $TARGET_DIR"
echo "✅ mkdir $TARGET_DIR"

gcloud compute ssh rooot@pinning-service --zone us-central1-a -- "mkdir $TARGET_DIR/src"
echo "✅ mkdir $TARGET_DIR/src"


# Copy the docker install script to the instance
gcloud compute scp --recurse $DIR/scripts/prepare-instance.sh rooot@pinning-service:$TARGET_DIR --zone us-central1-a 
echo "✅ scp prepare-instance.sh"

# Copy the src directory to the instance
gcloud compute scp --recurse $DIR/src rooot@pinning-service:$TARGET_DIR --zone us-central1-a
echo "✅ scp src"

# Copy the remaining necessary files to the instance 
# tree -L 1 -a -I 'node_modules|dist|.git|scripts|src'
# |-- .dockerignore
# |-- .env
# |-- .env.local
# |-- .gitignore
# |-- Dockerfile
# |-- README.md
# |-- docker-compose.yml
# |-- package-lock.json
# |-- package.json
# |-- service-account.json
# |-- tsconfig.json
# `-- yarn.lock
#
gcloud compute scp --recurse $DIR/{.dockerignore,.env,.gitignore,Dockerfile,README.md,docker-compose.yml,package-lock.json,package.json,service-account.json,tsconfig.json,static} rooot@pinning-service:$TARGET_DIR --zone us-central1-a 
echo "✅ scp remaining files"

# Run the docker install script on the instance 
# NOTE: this will take a while 
gcloud compute ssh rooot@pinning-service --zone us-central1-a -- ". $TARGET_DIR/prepare-instance.sh"
echo "✅ . $TARGET_DIR/prepare-instance.sh"
