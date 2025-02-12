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
let roomId = null;
let peerId = null;

// Handle WebSocket messages
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    switch(data.type) {
        case 'room-created':
            roomId = data.roomId;
            // Display room ID for sharing
            const shareLink = document.getElementById('shareLink');
            shareLink.value = `${window.location.origin}?room=${roomId}`;
            break;

        case 'peer-joined':
            peerId = data.peerId;
            // Create and send offer when peer joins
            dataChannel = peer.createDataChannel("fileTransfer");
            dataChannel.binaryType = "arraybuffer";
            setupSenderDataChannel(dataChannel);

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            ws.send(JSON.stringify({
                type: 'offer',
                target: peerId,
                data: offer
            }));
            break;

        case 'offer':
            document.getElementById('receiveSection').classList.remove('hidden');
            await peer.setRemoteDescription(new RTCSessionDescription(data.data));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            
            ws.send(JSON.stringify({
                type: 'answer',
                target: data.sender,
                data: answer
            }));
            break;

        case 'answer':
            await peer.setRemoteDescription(new RTCSessionDescription(data.data));
            break;

        case 'ice-candidate':
            try {
                await peer.addIceCandidate(data.data);
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
            break;

        case 'host-disconnected':
            alert('Host disconnected');
            location.reload();
            break;
    }
};

// Handle ICE candidates
peer.onicecandidate = (event) => {
    if (event.candidate) {
        ws.send(JSON.stringify({
            type: 'ice-candidate',
            target: peerId,
            data: event.candidate
        }));
    }
};

// Check URL for room ID and join if present
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: 'join-room',
                roomId: roomParam
            }));
        };
    }
});

// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    fileToSend = fileInput.files[0];
    
    // Create new room
    ws.send(JSON.stringify({
        type: 'create-room'
    }));

    document.getElementById('result').classList.remove('hidden');
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
