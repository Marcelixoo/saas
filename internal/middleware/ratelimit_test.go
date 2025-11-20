package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRateLimiter_AllowsRequestsWithinLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := NewRateLimiter(5) // 5 requests per minute
	router := gin.New()
	router.GET("/test", limiter.Middleware(), func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// Make 5 requests - all should succeed
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Request %d failed: expected status 200, got %d", i+1, w.Code)
		}
	}
}

func TestRateLimiter_BlocksRequestsOverLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := NewRateLimiter(3) // 3 requests per minute
	router := gin.New()
	router.GET("/test", limiter.Middleware(), func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// Make 3 requests - should succeed
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Request %d should have succeeded: got status %d", i+1, w.Code)
		}
	}

	// 4th request should be rate limited
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("Expected status %d (Too Many Requests), got %d", http.StatusTooManyRequests, w.Code)
	}
}

func TestRateLimiter_DifferentIPsTrackedSeparately(t *testing.T) {
	gin.SetMode(gin.TestMode)

	limiter := NewRateLimiter(2) // 2 requests per minute
	router := gin.New()
	router.GET("/test", limiter.Middleware(), func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// IP 1 makes 2 requests - both should succeed
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("IP1 request %d failed: got status %d", i+1, w.Code)
		}
	}

	// IP 2 makes 2 requests - both should also succeed (separate bucket)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.2:5678"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("IP2 request %d failed: got status %d", i+1, w.Code)
		}
	}

	// IP 1 makes another request - should be rate limited
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("IP1 should be rate limited: got status %d", w.Code)
	}

	// IP 2 makes another request - should also be rate limited
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.2:5678"
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("IP2 should be rate limited: got status %d", w.Code)
	}
}

func TestRateLimiter_TokensRefillAfterPeriod(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Use a shorter period for testing
	limiter := &RateLimiter{
		clients: make(map[string]*clientBucket),
		rate:    2,
		period:  100 * time.Millisecond, // 100ms instead of 1 minute
	}

	router := gin.New()
	router.GET("/test", limiter.Middleware(), func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// Use up the tokens
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("Initial request %d failed: got status %d", i+1, w.Code)
		}
	}

	// Should be rate limited now
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Error("Should be rate limited before refill period")
	}

	// Wait for refill period
	time.Sleep(150 * time.Millisecond)

	// Should work again after refill
	req = httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Request should succeed after refill: got status %d", w.Code)
	}
}

func TestNewRateLimiter(t *testing.T) {
	limiter := NewRateLimiter(100)

	if limiter.rate != 100 {
		t.Errorf("Expected rate 100, got %d", limiter.rate)
	}

	if limiter.period != time.Minute {
		t.Errorf("Expected period of 1 minute, got %v", limiter.period)
	}

	if limiter.clients == nil {
		t.Error("Clients map should be initialized")
	}
}
