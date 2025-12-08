package internal

import (
	"os"
	"testing"
)

func TestNewDependencies_Development(t *testing.T) {
	os.Setenv("APP_ENV", "development")
	os.Setenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fashiondb_test?sslmode=disable")
	os.Setenv("JWT_SECRET_KEY", "test-secret")
	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("JWT_SECRET_KEY")
	}()

	deps, err := NewDependencies()
	if err != nil {
		t.Skipf("Skipping test: PostgreSQL not available: %v", err)
		return
	}
	defer deps.Close()

	if deps.Environment != Development {
		t.Errorf("Expected environment %s, got %s", Development, deps.Environment)
	}

	if deps.DB == nil {
		t.Error("Expected DB to be initialized")
	}

	if deps.Users == nil {
		t.Error("Expected Users repository to be initialized")
	}

	if deps.Tenants == nil {
		t.Error("Expected Tenants repository to be initialized")
	}

	if deps.Memberships == nil {
		t.Error("Expected Memberships repository to be initialized")
	}

	if deps.Articles == nil {
		t.Error("Expected Articles repository to be initialized")
	}

	if deps.Authors == nil {
		t.Error("Expected Authors repository to be initialized")
	}

	if deps.Tags == nil {
		t.Error("Expected Tags repository to be initialized")
	}

	if deps.Config == nil {
		t.Error("Expected Config to be initialized")
	}
}

func TestNewDependencies_Preview(t *testing.T) {
	os.Setenv("APP_ENV", "preview")
	os.Setenv("JWT_SECRET_KEY", "test-secret")
	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("JWT_SECRET_KEY")
	}()

	deps, err := NewDependencies()
	if err != nil {
		t.Fatalf("Failed to initialize dependencies: %v", err)
	}
	defer deps.Close()

	if deps.Environment != Preview {
		t.Errorf("Expected environment %s, got %s", Preview, deps.Environment)
	}

	if deps.DB == nil {
		t.Error("Expected DB to be initialized")
	}

	if deps.Users == nil {
		t.Error("Expected Users repository to be initialized")
	}

	if deps.Articles == nil {
		t.Error("Expected Articles repository to be initialized")
	}

	if deps.Authors == nil {
		t.Error("Expected Authors repository to be initialized")
	}
}

func TestNewDependencies_Production_MissingDatabaseURL(t *testing.T) {
	os.Setenv("APP_ENV", "production")
	os.Setenv("JWT_SECRET_KEY", "test-secret")
	os.Unsetenv("DATABASE_URL")
	defer func() {
		os.Unsetenv("APP_ENV")
		os.Unsetenv("JWT_SECRET_KEY")
	}()

	_, err := NewDependencies()
	if err == nil {
		t.Error("Expected error when DATABASE_URL is missing in production")
	}

	expectedMsg := "DATABASE_URL required in production"
	if err.Error() != expectedMsg {
		t.Errorf("Expected error message '%s', got '%s'", expectedMsg, err.Error())
	}
}

func TestNewDependencies_DefaultsToDevelopment(t *testing.T) {
	os.Unsetenv("APP_ENV")
	os.Setenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/fashiondb_test?sslmode=disable")
	os.Setenv("JWT_SECRET_KEY", "test-secret")
	defer func() {
		os.Unsetenv("DATABASE_URL")
		os.Unsetenv("JWT_SECRET_KEY")
	}()

	deps, err := NewDependencies()
	if err != nil {
		t.Skipf("Skipping test: PostgreSQL not available: %v", err)
		return
	}
	defer deps.Close()

	if deps.Environment != Development {
		t.Errorf("Expected default environment %s, got %s", Development, deps.Environment)
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	tests := []struct {
		name         string
		key          string
		defaultValue string
		envValue     string
		expected     string
	}{
		{
			name:         "returns env value when set",
			key:          "TEST_KEY",
			defaultValue: "default",
			envValue:     "custom",
			expected:     "custom",
		},
		{
			name:         "returns default when env not set",
			key:          "UNSET_KEY",
			defaultValue: "default",
			envValue:     "",
			expected:     "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue != "" {
				os.Setenv(tt.key, tt.envValue)
				defer os.Unsetenv(tt.key)
			} else {
				os.Unsetenv(tt.key)
			}

			result := getEnvOrDefault(tt.key, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}
