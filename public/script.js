// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    const fileToSend = fileInput.files[0];
    
    // Create WebRTC room as host
    const socket = io();
    
    socket.emit('create-room');

    socket.on('room-created', (roomId) => {
        // Show sharing UI
        document.getElementById('result').classList.remove('hidden');
        document.getElementById('senderStatus').innerText = 'Waiting for receiver to connect...';
        
        // Set share link
        const shareLink = document.getElementById('shareLink');
        shareLink.value = `${window.location.origin}?room=${roomId}`;
    });

    // Handle peer joining
    socket.on('peer-joined', async (peerId) => {
        document.getElementById('senderStatus').innerText = 'Receiver connected, starting transfer...';
        
        // Create peer connection
        const peerConnection = new RTCPeerConnection();
        
        // Create data channel
        const dataChannel = peerConnection.createDataChannel('fileTransfer');
        
        // Handle data channel open
        dataChannel.onopen = () => {
            // Start file transfer
            const reader = new FileReader();
            reader.onload = (e) => {
                dataChannel.send(e.target.result);
                document.getElementById('senderStatus').innerText = 'Transfer complete!';
                document.getElementById('progressBar').style.width = '100%';
            };
            reader.readAsArrayBuffer(fileToSend);
        };

        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', {
            peerId: peerId,
            signal: offer
        });

        // Handle answer
        socket.on('signal', async ({ signal }) => {
            await peerConnection.setRemoteDescription(signal);
        });
    });

    socket.on('peer-disconnected', () => {
        document.getElementById('senderStatus').innerText = 'Receiver disconnected';
    });
});

// Check URL for room ID
window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
        document.getElementById('hostSection').classList.add('hidden');
        document.getElementById('receiveSection').classList.remove('hidden');

        const socket = io();
        socket.emit('join-room', roomId);

        socket.on('error', (error) => {
            document.getElementById('receiverStatus').innerText = error;
        });

        // Handle WebRTC connection
        const peerConnection = new RTCPeerConnection();

        peerConnection.ondatachannel = (event) => {
            const dataChannel = event.channel;
            
            // Handle incoming file data
            const chunks = [];
            dataChannel.onmessage = (e) => {
                chunks.push(e.data);
                document.getElementById('progressBar').style.width = '50%';
            };

            dataChannel.onclose = () => {
                // Create blob from received chunks
                const blob = new Blob(chunks);
                const downloadLink = document.getElementById('downloadLink');
                downloadLink.href = URL.createObjectURL(blob);
                downloadLink.classList.remove('hidden');
                document.getElementById('receiverStatus').innerText = 'Transfer complete!';
                document.getElementById('progressBar').style.width = '100%';
            };
        };

        // Handle WebRTC signaling
        socket.on('signal', async ({ peerId, signal }) => {
            if (signal.type === 'offer') {
                await peerConnection.setRemoteDescription(signal);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', {
                    peerId: peerId,
                    signal: answer
                });
            }
        });

        socket.on('host-disconnected', () => {
            document.getElementById('receiverStatus').innerText = 'Host disconnected';
        });
    }
});
