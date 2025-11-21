package security

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	return string(bytes), err
}

func ComparePassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}
