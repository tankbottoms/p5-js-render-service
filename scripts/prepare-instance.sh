# After running create-instance, THIS SCRIPT IS RUN BY INSTALL INSTANCE!

# This script will:
#  - mnt the disk (assumes 100GB)
#  - install docker
#  - install docker-compose

# Mount the disk
# Get the name of the new disk
disk_name=$(lsblk | awk '/^nvme/ && $4 == "100G" {print $1}')

# Full path to the disk device
disk_device="/dev/$disk_name"

# Check if the disk name is not empty
if [ -n "$disk_name" ]; then
    # Create a mount point
    mount_point="/mnt/scratch"

    # Check if the disk is already mounted
    if ! mountpoint -q $mount_point; then
        # Format the disk
        sudo mkfs.ext4 $disk_device

        # Create the mount point directory if it doesn't exist
        sudo mkdir -p $mount_point

        # Mount the disk
        sudo mount $disk_device $mount_point

        # Add an entry to /etc/fstab
        echo "$disk_device $mount_point ext4 defaults 0 0" | sudo tee -a /etc/fstab
    else
        echo "Disk is already mounted."
    fi
else
    echo "No disk found."
fi

# Check if docker is installed
if [ -x "$(command -v docker)" ]; then
	echo "Docker is already installed"
	exit 0
fi

# Install docker 
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null 

sudo apt-get update

sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 

sudo usermod -aG docker rooot
