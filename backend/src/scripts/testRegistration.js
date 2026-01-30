async function testRegistration() {
    try {
        console.log('Attempting registration with fetch...');
        const response = await fetch('http://localhost:3000/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'fetchdriver@test.com',
                password: 'password123',
                name: 'Fetch Driver',
                phone: '1122334455'
            })
        });
        const data = await response.json();
        console.log('Registration Response:', data);
    } catch (error) {
        console.error('Registration Failed:', error.message);
    }
}

testRegistration();
