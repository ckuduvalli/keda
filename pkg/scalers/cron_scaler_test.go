package scalers

import (
	"context"
	"github.com/stretchr/testify/assert"
	appsv1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"os"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"testing"
	"time"
)

type parseCronMetadataTestData struct {
	metadata   map[string]string
	isError    bool
}

// A complete valid metadata example for reference
var validCronMetadata = map[string]string{
	"timezone"       : "Etc/UTC",
	"start"          : "0 0 * * Thu",
	"end"            : "59 23 * * Thu",
	"desiredReplicas": "10",
}

var testCronMetadata = []parseCronMetadataTestData{
	{map[string]string{}, true},
	{validCronMetadata, false},
	{map[string]string{"timezone": "Asia/Kolkata", "start": "30 * * * *", "end": "45 * * * *"}, true},
	{map[string]string{"start": "30 * * * *", "end": "45 * * * *", "desiredReplicas": "10"}, true},
}

var scaler Scaler = nil
var tz, _ = time.LoadLocation(validCronMetadata["timezone"])
var currentDay = time.Now().In(tz).Weekday().String()

func TestMain(m *testing.M) {
	var replicaCount int32 = 3
	var dep = &appsv1.Deployment{
		TypeMeta: metav1.TypeMeta{Kind: "Deployment", APIVersion: "apps/v1"},
		ObjectMeta: metav1.ObjectMeta{Name: "test-deployment", Namespace: "test", Labels: map[string]string{"app": "nginx"}},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicaCount,
			Selector: &metav1.LabelSelector {
				MatchLabels: map[string]string{"app": "nginx"},
			},
			Template: v1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "nginx"}},
				Spec:       v1.PodSpec{Containers: []v1.Container{{Name: "nginx", Image: "nginx"}}},
			},
		},
	}

	var scheme = runtime.NewScheme()
	scheme.AddKnownTypeWithName(schema.GroupVersionKind{Version: "apps/v1", Group: "", Kind: "Deployment"}, dep)
	client := fake.NewFakeClientWithScheme(scheme,dep)
	scaler,_ = NewCronScaler(client, "test-deployment", "test", map[string]string{}, validCronMetadata)

	os.Exit(m.Run())
}

func TestCronParseMetadata(t *testing.T) {
	for _, testData := range testCronMetadata {
		_, err := parseCronMetadata(testData.metadata, map[string]string{})
		if err != nil && !testData.isError {
			t.Error("Expected success but got error", err)
		}
		if testData.isError && err == nil {
			t.Error("Expected error but got success")
		}
	}
}

func TestIsActive(t *testing.T) {
	isActive, _ := scaler.IsActive(context.TODO())
	if currentDay == "Thursday" {
		assert.Equal(t, isActive, true)
	} else {
		assert.Equal(t, isActive, false)
	}
}

func TestGetMetrics(t *testing.T) {
	metrics,_ := scaler.GetMetrics(context.TODO(), "ReplicaCount", nil)
	assert.Equal(t, metrics[0].MetricName, "ReplicaCount")
	if currentDay == "Thursday" {
		assert.Equal(t, metrics[0].Value.Value(), int64(10))
	} else {
		assert.Equal(t, metrics[0].Value.Value(), int64(1))
	}
}