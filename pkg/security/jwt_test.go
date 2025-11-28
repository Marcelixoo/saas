package security

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestNewJWTService(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	if service == nil {
		t.Fatal("NewJWTService should return a service")
	}

	if service.issuer != "test-issuer" {
		t.Errorf("Expected issuer 'test-issuer', got '%s'", service.issuer)
	}

	if service.ttl != time.Hour {
		t.Errorf("Expected TTL 1 hour, got %v", service.ttl)
	}
}

func TestGenerateToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	token, err := service.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if token == "" {
		t.Error("Token should not be empty")
	}
}

func TestGenerateTenantToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	token, err := service.GenerateTenantToken("user123", "test@example.com", "tenant456")
	if err != nil {
		t.Fatalf("GenerateTenantToken failed: %v", err)
	}

	if token == "" {
		t.Error("Token should not be empty")
	}

	claims, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.TenantID != "tenant456" {
		t.Errorf("Expected tenant ID 'tenant456', got '%s'", claims.TenantID)
	}
}

func TestValidateToken_ValidToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	token, err := service.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != "user123" {
		t.Errorf("Expected user ID 'user123', got '%s'", claims.UserID)
	}

	if claims.Email != "test@example.com" {
		t.Errorf("Expected email 'test@example.com', got '%s'", claims.Email)
	}

	if claims.Issuer != "test-issuer" {
		t.Errorf("Expected issuer 'test-issuer', got '%s'", claims.Issuer)
	}
}

func TestValidateToken_ExpiredToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", -time.Hour)

	token, err := service.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	_, err = service.ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken should fail with expired token")
	}

	if err != ErrExpiredToken {
		t.Errorf("Expected ErrExpiredToken, got %v", err)
	}
}

func TestValidateToken_InvalidToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	_, err := service.ValidateToken("invalid.token.here")
	if err == nil {
		t.Error("ValidateToken should fail with invalid token")
	}

	if err != ErrInvalidToken {
		t.Errorf("Expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	service1 := NewJWTService("secret1", "test-issuer", time.Hour)
	service2 := NewJWTService("secret2", "test-issuer", time.Hour)

	token, err := service1.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	_, err = service2.ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken should fail with wrong secret")
	}

	if err != ErrInvalidToken {
		t.Errorf("Expected ErrInvalidToken, got %v", err)
	}
}

func TestValidateToken_MalformedToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	tests := []string{
		"",
		"not-a-jwt",
		"header.payload",
		"header.payload.signature.extra",
	}

	for _, token := range tests {
		_, err := service.ValidateToken(token)
		if err == nil {
			t.Errorf("ValidateToken should fail with malformed token: %s", token)
		}
	}
}

func TestValidateToken_WrongAlgorithm(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	claims := TokenClaims{
		UserID: "user123",
		Email:  "test@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "test-issuer",
			Subject:   "user123",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenString, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	_, err := service.ValidateToken(tokenString)
	if err == nil {
		t.Error("ValidateToken should fail with wrong algorithm")
	}
}

func TestRefreshToken_ValidToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	originalToken, err := service.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	time.Sleep(time.Second)

	newToken, err := service.RefreshToken(originalToken)
	if err != nil {
		t.Fatalf("RefreshToken failed: %v", err)
	}

	if newToken == "" {
		t.Error("Refreshed token should not be empty")
	}

	if newToken == originalToken {
		t.Error("Refreshed token should be different from original")
	}

	claims, err := service.ValidateToken(newToken)
	if err != nil {
		t.Fatalf("ValidateToken failed on refreshed token: %v", err)
	}

	if claims.UserID != "user123" {
		t.Errorf("Expected user ID 'user123', got '%s'", claims.UserID)
	}
}

func TestRefreshToken_ExpiredToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", -time.Hour)

	expiredToken, err := service.GenerateToken("user123", "test@example.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	newToken, err := service.RefreshToken(expiredToken)
	if err != nil {
		t.Fatalf("RefreshToken should work with expired token: %v", err)
	}

	if newToken == "" {
		t.Error("Refreshed token should not be empty")
	}
}

func TestRefreshToken_InvalidToken(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	_, err := service.RefreshToken("invalid.token.here")
	if err == nil {
		t.Error("RefreshToken should fail with invalid token")
	}
}

func TestTokenClaims_PreservesAllFields(t *testing.T) {
	service := NewJWTService("test-secret", "test-issuer", time.Hour)

	token, err := service.GenerateTenantToken("user123", "test@example.com", "tenant456")
	if err != nil {
		t.Fatalf("GenerateTenantToken failed: %v", err)
	}

	claims, err := service.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != "user123" {
		t.Errorf("UserID not preserved: expected 'user123', got '%s'", claims.UserID)
	}

	if claims.Email != "test@example.com" {
		t.Errorf("Email not preserved: expected 'test@example.com', got '%s'", claims.Email)
	}

	if claims.TenantID != "tenant456" {
		t.Errorf("TenantID not preserved: expected 'tenant456', got '%s'", claims.TenantID)
	}

	if claims.Subject != "user123" {
		t.Errorf("Subject not preserved: expected 'user123', got '%s'", claims.Subject)
	}
}
