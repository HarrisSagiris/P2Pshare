// Connect to WebSocket server
const ws = new WebSocket(`ws://${window.location.hostname}:3000`);

const peer = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
});

let dataChannel;
let fileToSend = null;
const CHUNK_SIZE = 16384;

// Handle WebSocket messages
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'offer') {
        // Handle incoming offer
        document.getElementById('receiveSection').classList.remove('hidden');
        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        
        // Send answer back through WebSocket
        ws.send(JSON.stringify({
            type: 'answer',
            answer: answer
        }));
    } 
    else if (data.type === 'answer') {
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
    else if (data.type === 'ice-candidate') {
        try {
            await peer.addIceCandidate(data.candidate);
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    }
};

// Handle ICE candidates
peer.onicecandidate = (event) => {
    if (event.candidate) {
        // Send ICE candidate through WebSocket
        ws.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: event.candidate
        }));
    }
};

// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    fileToSend = fileInput.files[0];
    dataChannel = peer.createDataChannel("fileTransfer");
    dataChannel.binaryType = "arraybuffer";
    setupSenderDataChannel(dataChannel);

    try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        // Send offer through WebSocket
        ws.send(JSON.stringify({
            type: 'offer',
            offer: offer
        }));

        document.getElementById('result').classList.remove('hidden');
    } catch (err) {
        console.error("Error creating offer:", err);
        alert("Failed to create connection. Please try again.");
    }
});

function setupSenderDataChannel(channel) {
    let offset = 0;
    
    channel.onopen = async () => {
        console.log("Data channel opened");
        channel.send(JSON.stringify({
            fileName: fileToSend.name,
            fileSize: fileToSend.size,
            fileType: fileToSend.type
        }));

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
                setTimeout(sendChunk, 0);
            }
        };

        sendChunk();
    };

    channel.onerror = (error) => {
        console.error("Data channel error:", error);
    };
}

// Handle receiving data channel
peer.ondatachannel = event => {
    console.log("Data channel received");
    const receiveChannel = event.channel;
    receiveChannel.binaryType = "arraybuffer";

    let receivedBuffers = [];
    let receivedSize = 0;
    let fileInfo = null;

    receiveChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            fileInfo = JSON.parse(event.data);
            document.getElementById('receiverStatus').innerText = 
                `Receiving ${fileInfo.fileName}...`;
        } else {
            receivedBuffers.push(event.data);
            receivedSize += event.data.byteLength;
            
            if (fileInfo) {
                const progress = (receivedSize / fileInfo.fileSize) * 100;
                document.getElementById('progressBar').style.width = progress + '%';
                
                if (receivedSize === fileInfo.fileSize) {
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
