package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type RateLimiter struct {
	clients map[string]*clientBucket
	mu      sync.RWMutex
	rate    int
	period  time.Duration
}

type clientBucket struct {
	tokens     int
	lastRefill time.Time
	mu         sync.Mutex
}

func NewRateLimiter(requestsPerMinute int) *RateLimiter {
	return &RateLimiter{
		clients: make(map[string]*clientBucket),
		rate:    requestsPerMinute,
		period:  time.Minute,
	}
}

func (rl *RateLimiter) getClientBucket(clientIP string) *clientBucket {
	rl.mu.RLock()
	bucket, exists := rl.clients[clientIP]
	rl.mu.RUnlock()

	if !exists {
		rl.mu.Lock()
		bucket = &clientBucket{
			tokens:     rl.rate,
			lastRefill: time.Now(),
		}
		rl.clients[clientIP] = bucket
		rl.mu.Unlock()
	}

	return bucket
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		bucket := rl.getClientBucket(clientIP)

		bucket.mu.Lock()
		defer bucket.mu.Unlock()

		now := time.Now()
		elapsed := now.Sub(bucket.lastRefill)

		if elapsed >= rl.period {
			bucket.tokens = rl.rate
			bucket.lastRefill = now
		}

		if bucket.tokens > 0 {
			bucket.tokens--
			c.Next()
		} else {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
		}
	}
}

func (rl *RateLimiter) Cleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			rl.mu.Lock()
			now := time.Now()
			for ip, bucket := range rl.clients {
				bucket.mu.Lock()
				if now.Sub(bucket.lastRefill) > 10*time.Minute {
					delete(rl.clients, ip)
				}
				bucket.mu.Unlock()
			}
			rl.mu.Unlock()
		}
	}()
}
