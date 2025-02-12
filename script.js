const peer = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
});
let dataChannel;
let fileToSend = null;
const CHUNK_SIZE = 16384; // 16KB chunks

// Handle file selection
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    fileToSend = fileInput.files[0];

    // Create data channel
    dataChannel = peer.createDataChannel("fileTransfer");
    dataChannel.binaryType = "arraybuffer";
    setupSenderDataChannel(dataChannel);

    try {
        // Generate offer
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        // Add ICE candidate handling
        peer.onicecandidate = (event) => {
            if (event.candidate === null) {
                // ICE gathering completed
                const link = `${window.location.origin}?offer=${btoa(JSON.stringify(peer.localDescription))}`;
                document.getElementById('shareLink').value = link;
                document.getElementById('result').classList.remove('hidden');

                // Generate QR code
                const qrCodeDiv = document.getElementById('qrCode');
                qrCodeDiv.innerHTML = '';
                new QRCode(qrCodeDiv, {
                    text: link,
                    width: 256,
                    height: 256,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        };

    } catch (err) {
        console.error("Error creating offer:", err);
        alert("Failed to create connection. Please try again.");
    }
});

function setupSenderDataChannel(channel) {
    let offset = 0;
    
    channel.onopen = async () => {
        console.log("Data channel opened");
        // First send the file metadata
        channel.send(JSON.stringify({
            fileName: fileToSend.name,
            fileSize: fileToSend.size,
            fileType: fileToSend.type
        }));

        // Then start sending the file in chunks
        const reader = new FileReader();
        
        const sendChunk = async () => {
            if (offset >= fileToSend.size) return;
            
            const slice = fileToSend.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        reader.onload = () => {
            channel.send(reader.result);
            offset += reader.result.byteLength;
            const progress = Math.min((offset / fileToSend.size) * 100, 100);
            document.getElementById('progressBar').style.width = progress + '%';
            
            if (offset < fileToSend.size) {
                // Send next chunk
                setTimeout(sendChunk, 0);
            }
        };

        sendChunk();
    };

    channel.onerror = (error) => {
        console.error("Data channel error:", error);
    };
}

// Handle receiving connection
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('offer')) {
    try {
        const offer = JSON.parse(atob(urlParams.get('offer')));
        document.getElementById('receiveSection').classList.remove('hidden');

        peer.onicecandidate = (event) => {
            if (event.candidate === null) {
                // Send answer back (in real app, this would go through your signaling server)
                console.log("ICE gathering completed for receiver");
            }
        };

        peer.setRemoteDescription(new RTCSessionDescription(offer))
            .then(() => peer.createAnswer())
            .then(answer => peer.setLocalDescription(answer))
            .catch(err => {
                console.error("Error in receiver setup:", err);
                document.getElementById('receiverStatus').innerText = "Connection failed!";
            });

        let receivedBuffers = [];
        let receivedSize = 0;
        let fileInfo = null;

        peer.ondatachannel = event => {
            console.log("Data channel received");
            const receiveChannel = event.channel;
            receiveChannel.binaryType = "arraybuffer";

            receiveChannel.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    // This is the metadata
                    fileInfo = JSON.parse(event.data);
                    document.getElementById('receiverStatus').innerText = 
                        `Receiving ${fileInfo.fileName}...`;
                } else {
                    // This is file data
                    receivedBuffers.push(event.data);
                    receivedSize += event.data.byteLength;
                    
                    if (fileInfo) {
                        const progress = (receivedSize / fileInfo.fileSize) * 100;
                        document.getElementById('progressBar').style.width = progress + '%';
                        
                        if (receivedSize === fileInfo.fileSize) {
                            // File transfer complete
                            const receivedBlob = new Blob(receivedBuffers, { type: fileInfo.fileType });
                            const downloadLink = document.getElementById('downloadLink');
                            downloadLink.href = URL.createObjectURL(receivedBlob);
                            downloadLink.download = fileInfo.fileName;
                            downloadLink.classList.remove('hidden');
                            downloadLink.innerText = `Download ${fileInfo.fileName}`;
                            document.getElementById('receiverStatus').innerText = "Transfer complete!";
                        }
                    }
                }
            };

            receiveChannel.onopen = () => {
                console.log("Receive channel opened");
                document.getElementById('receiverStatus').innerText = "Connected! Waiting for file...";
            };

            receiveChannel.onerror = (error) => {
                console.error("Data channel error:", error);
                document.getElementById('receiverStatus').innerText = "Error during transfer!";
            };
        };

    } catch (err) {
        console.error("Error processing offer:", err);
        document.getElementById('receiverStatus').innerText = "Invalid connection data!";
    }
}
