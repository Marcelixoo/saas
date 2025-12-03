package security

import (
	"testing"
)

func TestHashPassword(t *testing.T) {
	password := "mySecurePassword123!"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	if hash == "" {
		t.Error("Hash should not be empty")
	}

	if hash == password {
		t.Error("Hash should not equal plain password")
	}
}

func TestHashPassword_DifferentHashesForSamePassword(t *testing.T) {
	password := "mySecurePassword123!"

	hash1, err := HashPassword(password)
	if err != nil {
		t.Fatalf("First hash failed: %v", err)
	}

	hash2, err := HashPassword(password)
	if err != nil {
		t.Fatalf("Second hash failed: %v", err)
	}

	if hash1 == hash2 {
		t.Error("Different hash calls should produce different salts")
	}
}

func TestComparePassword_ValidPassword(t *testing.T) {
	password := "mySecurePassword123!"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	err = ComparePassword(hash, password)
	if err != nil {
		t.Errorf("ComparePassword should succeed with correct password: %v", err)
	}
}

func TestComparePassword_InvalidPassword(t *testing.T) {
	password := "mySecurePassword123!"
	wrongPassword := "wrongPassword"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	err = ComparePassword(hash, wrongPassword)
	if err == nil {
		t.Error("ComparePassword should fail with incorrect password")
	}
}

func TestComparePassword_EmptyPassword(t *testing.T) {
	password := "mySecurePassword123!"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}

	err = ComparePassword(hash, "")
	if err == nil {
		t.Error("ComparePassword should fail with empty password")
	}
}

func TestHashPassword_EmptyPassword(t *testing.T) {
	hash, err := HashPassword("")
	if err != nil {
		t.Fatalf("HashPassword should handle empty string: %v", err)
	}

	if hash == "" {
		t.Error("Hash should not be empty even for empty password")
	}
}
