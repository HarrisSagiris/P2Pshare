// Handle file selection and sharing
document.getElementById('shareBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) {
        alert('Please select a file first!');
        return;
    }

    fileToSend = fileInput.files[0];
    
    // Upload file to server with metadata
    const formData = new FormData();
    formData.append('file', fileToSend);
    
    // Optional metadata fields
    const senderEmail = prompt('Enter your email (optional):');
    const recipientEmail = prompt('Enter recipient email (optional):');
    const message = prompt('Enter a message (optional):');
    const maxDownloads = prompt('Enter maximum number of downloads (0 for unlimited):');

    if (senderEmail) formData.append('senderEmail', senderEmail);
    if (recipientEmail) formData.append('recipientEmail', recipientEmail);
    if (message) formData.append('message', message);
    if (maxDownloads) formData.append('maxDownloads', maxDownloads);

    try {
        // Show upload progress
        document.getElementById('result').classList.remove('hidden');
        document.getElementById('senderStatus').innerText = 'Uploading file...';
        document.getElementById('progressBar').style.width = '0%';

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            const shareLink = document.getElementById('shareLink');
            shareLink.value = result.downloadLink;
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('senderStatus').innerText = 'File uploaded successfully!' + 
                (recipientEmail ? ' Email notification sent to recipient.' : '');
        } else {
            throw new Error(result.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        document.getElementById('uploadFallback').classList.remove('hidden');
        document.getElementById('senderStatus').innerText = 'Direct upload failed. Please try the fallback upload.';
        document.getElementById('progressBar').style.width = '0%';
    }
});

// Check URL for download link
window.addEventListener('load', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get('file');
    
    if (fileId) {
        document.getElementById('hostSection').classList.add('hidden');
        document.getElementById('receiveSection').classList.remove('hidden');

        try {
            // Verify file exists and is available
            const response = await fetch(`/download/${fileId}`, {
                method: 'HEAD'
            });

            if (response.ok) {
                const downloadLink = document.getElementById('downloadLink');
                downloadLink.href = `/download/${fileId}`;
                downloadLink.classList.remove('hidden');
                downloadLink.innerText = 'Download Securely';
                document.getElementById('receiverStatus').innerText = 'Your file is ready for secure download!';
                document.getElementById('progressBar').style.width = '100%';
            } else {
                const error = await response.json();
                document.getElementById('receiverStatus').innerText = error.error || 'File not available';
                document.getElementById('progressBar').style.width = '0%';
            }
        } catch (error) {
            document.getElementById('receiverStatus').innerText = 'Error accessing file';
            document.getElementById('progressBar').style.width = '0%';
        }
    }
});
